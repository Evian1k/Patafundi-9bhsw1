import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json, err } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function admin() { return createClient(supabaseUrl, serviceKey); }

async function getAuthUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await admin().auth.getUser(token);
  return user || null;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const fullPath = url.pathname.replace(/^\/functions\/v1\/disputes/, '');
  const db = admin();

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return err('Unauthorized', 401);

    // POST /disputes
    if (fullPath === '' && req.method === 'POST') {
      const { jobId, reason, evidenceUrls = [], disputeType = 'general' } = await req.json();
      if (!jobId || !reason) return err('jobId and reason required');

      const { data: job } = await db.from('jobs').select('*').eq('id', jobId).maybeSingle();
      if (!job) return err('Job not found', 404);

      const { data: existing } = await db.from('disputes').select('id').eq('job_id', jobId).eq('raised_by', authUser.id).maybeSingle();
      if (existing) return err('You already have an open dispute for this job', 409);

      const { data: dispute, error } = await db.from('disputes').insert({
        job_id: jobId,
        raised_by: authUser.id,
        customer_id: job.customer_id,
        fundi_id: job.fundi_id,
        reason,
        dispute_type: disputeType,
        status: 'open',
      }).select().maybeSingle();
      if (error) return err(error.message);

      await db.from('dispute_timeline').insert({
        dispute_id: dispute!.id,
        action: 'Dispute opened',
        actor: authUser.email || authUser.id,
        actor_role: 'customer',
        note: reason,
      });

      // Freeze job payment if any
      await db.from('payments').update({ escrow_status: 'frozen' })
        .eq('job_id', jobId)
        .in('status', ['processing', 'completed']);

      return json({ dispute, message: 'Dispute opened. Our team will review within 24 hours.' }, 201);
    }

    // GET /disputes
    if (fullPath === '' && req.method === 'GET') {
      const status = url.searchParams.get('status') || undefined;
      let query = db.from('disputes')
        .select('*, dispute_evidence(*), dispute_timeline(*)')
        .or(`raised_by.eq.${authUser.id},customer_id.eq.${authUser.id}`)
        .order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data: disputes } = await query;
      return json({ disputes: disputes || [] });
    }

    // GET /disputes/:id
    const idMatch = fullPath.match(/^\/([a-f0-9-]{36})$/);
    if (idMatch && req.method === 'GET') {
      const { data: dispute } = await db.from('disputes')
        .select('*, dispute_evidence(*), dispute_timeline(*)')
        .eq('id', idMatch[1])
        .maybeSingle();
      if (!dispute) return err('Dispute not found', 404);
      return json({ dispute });
    }

    // POST /disputes/:id/evidence
    const evidenceMatch = fullPath.match(/^\/([a-f0-9-]{36})\/evidence$/);
    if (evidenceMatch && req.method === 'POST') {
      const disputeId = evidenceMatch[1];
      const contentType = req.headers.get('content-type') || '';
      const urls: string[] = [];

      if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        const files = form.getAll('evidence') as File[];
        for (const file of files) {
          const { data } = await db.storage.from('dispute-evidence').upload(
            `${disputeId}/${Date.now()}-${file.name}`,
            file,
            { contentType: file.type }
          );
          if (data) {
            const { data: urlData } = db.storage.from('dispute-evidence').getPublicUrl(data.path);
            urls.push(urlData.publicUrl);
            await db.from('dispute_evidence').insert({
              dispute_id: disputeId,
              url: urlData.publicUrl,
              file_type: file.type.startsWith('image') ? 'image' : 'document',
              uploaded_by: authUser.id,
            });
          }
        }
      }

      return json({ uploaded: urls.length, urls, message: `${urls.length} file(s) uploaded` });
    }

    return err('Route not found', 404);
  } catch (e) {
    console.error('[disputes]', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
