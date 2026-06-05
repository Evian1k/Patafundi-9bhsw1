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

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function notifyUser(db: ReturnType<typeof admin>, userId: string, title: string, body: string, type = 'info', data: Record<string, unknown> = {}) {
  return db.from('notifications').insert({ user_id: userId, title, body, type, data });
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const fullPath = url.pathname.replace(/^\/functions\/v1\/jobs/, '');
  const db = admin();

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return err('Unauthorized', 401);

    const { data: userProfile } = await db.from('user_profiles').select('id, role').eq('id', authUser.id).maybeSingle();

    // GET /jobs
    if (fullPath === '' && req.method === 'GET') {
      const { data: jobs } = await db.from('jobs')
        .select('*, fundis(first_name, last_name, rating)')
        .eq('customer_id', authUser.id)
        .order('created_at', { ascending: false });
      return json({ jobs: jobs || [] });
    }

    // POST /jobs
    if (fullPath === '' && req.method === 'POST') {
      const body = await req.json();
      if (!body.serviceCategory || !body.description) return err('serviceCategory and description required');

      const { data: job, error } = await db.from('jobs').insert({
        customer_id: authUser.id,
        service_category: body.serviceCategory,
        description: body.description,
        location_name: body.locationName || body.location_name || null,
        latitude: body.latitude || null,
        longitude: body.longitude || null,
        urgency: body.urgency || 'normal',
        status: 'pending',
        notes: body.notes || null,
      }).select().maybeSingle();

      if (error) return err(error.message, 400);

      // Log status
      await db.from('job_status_history').insert({
        job_id: job.id, from_status: null, to_status: 'pending', changed_by: authUser.id,
      });

      return json({ job, message: 'Job created. Searching for nearby fundis...' }, 201);
    }

    // GET /jobs/fundi/active
    if (fullPath === '/fundi/active' && req.method === 'GET') {
      const { data: fundi } = await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return json({ job: null });
      const { data: job } = await db.from('jobs')
        .select('*')
        .eq('fundi_id', fundi.id)
        .in('status', ['accepted', 'on_the_way', 'arrived', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ job });
    }

    // GET /jobs/:id
    const idMatch = fullPath.match(/^\/([a-f0-9-]{36})$/);
    if (idMatch && req.method === 'GET') {
      const jobId = idMatch[1];
      const { data: job } = await db.from('jobs')
        .select('*, fundis(id, first_name, last_name, rating, trust_score, phone)')
        .eq('id', jobId)
        .maybeSingle();
      if (!job) return err('Job not found', 404);
      return json({ job });
    }

    // GET /jobs/:id/status
    const statusMatch = fullPath.match(/^\/([a-f0-9-]{36})\/status$/);
    if (statusMatch) {
      const jobId = statusMatch[1];
      if (req.method === 'GET') {
        const { data: job } = await db.from('jobs').select('id, status, updated_at').eq('id', jobId).maybeSingle();
        if (!job) return err('Job not found', 404);
        return json({ status: job.status, updatedAt: job.updated_at });
      }
      // PATCH /jobs/:id/status (fundi only)
      if (req.method === 'PATCH') {
        const { status } = await req.json();
        const { data: job, error } = await db.from('jobs').update({ status }).eq('id', jobId).select().maybeSingle();
        if (error) return err(error.message);
        return json({ job });
      }
    }

    // GET /jobs/:id/location
    const locationMatch = fullPath.match(/^\/([a-f0-9-]{36})\/location$/);
    if (locationMatch && req.method === 'GET') {
      const jobId = locationMatch[1];
      const { data: job } = await db.from('jobs').select('fundi_id').eq('id', jobId).maybeSingle();
      if (!job?.fundi_id) return json({ location: null });
      const { data: loc } = await db.from('fundi_locations')
        .select('latitude, longitude, recorded_at')
        .eq('fundi_id', job.fundi_id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ location: loc });
    }

    // POST /jobs/:id/accept (fundi)
    const acceptMatch = fullPath.match(/^\/([a-f0-9-]{36})\/accept$/);
    if (acceptMatch && req.method === 'POST') {
      const jobId = acceptMatch[1];
      const { estimatedPrice } = await req.json().catch(() => ({}));
      const { data: fundi } = await db.from('fundis').select('id, verification_status, subscription_active').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return err('Fundi profile not found', 404);
      if (fundi.verification_status !== 'approved') return err('Account not approved', 403);

      const { data: job } = await db.from('jobs').select('*').eq('id', jobId).eq('status', 'pending').maybeSingle();
      if (!job) return err('Job not available', 404);

      const otp = generateOtp();
      const { data: updated, error } = await db.from('jobs').update({
        fundi_id: fundi.id,
        status: 'accepted',
        estimated_price: estimatedPrice || job.estimated_price,
        completion_otp: otp,
      }).eq('id', jobId).select().maybeSingle();
      if (error) return err(error.message);

      await db.from('job_status_history').insert({ job_id: jobId, from_status: 'pending', to_status: 'accepted', changed_by: authUser.id });
      await notifyUser(db, job.customer_id, 'Fundi Accepted!', 'A fundi has accepted your job request.', 'job_accepted', { jobId });

      return json({ job: updated, message: 'Job accepted' });
    }

    // POST /jobs/:id/check-in (fundi)
    const checkinMatch = fullPath.match(/^\/([a-f0-9-]{36})\/check-in$/);
    if (checkinMatch && req.method === 'POST') {
      const jobId = checkinMatch[1];
      const { latitude, longitude, status: checkStatus = 'on_the_way' } = await req.json();
      const { data: fundi } = await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return err('Fundi not found', 404);
      await db.from('jobs').update({ status: checkStatus }).eq('id', jobId).eq('fundi_id', fundi.id);
      if (latitude && longitude) {
        await db.from('fundi_locations').insert({ fundi_id: fundi.id, latitude, longitude });
      }
      await db.from('job_status_history').insert({ job_id: jobId, from_status: null, to_status: checkStatus, changed_by: authUser.id });
      return json({ status: checkStatus, message: 'Location updated' });
    }

    // POST /jobs/:id/complete (fundi marks job done)
    const completeMatch = fullPath.match(/^\/([a-f0-9-]{36})\/complete$/);
    if (completeMatch && req.method === 'POST') {
      const jobId = completeMatch[1];
      const { data: fundi } = await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle();
      let finalPrice: number | undefined;
      const photoUrls: string[] = [];

      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        finalPrice = parseFloat(form.get('finalPrice') as string);
        const photos = form.getAll('photos') as File[];
        for (const photo of photos) {
          const { data } = await db.storage.from('job-photos').upload(
            `${jobId}/${Date.now()}-${photo.name}`,
            photo,
            { contentType: photo.type }
          );
          if (data) {
            const { data: urlData } = db.storage.from('job-photos').getPublicUrl(data.path);
            photoUrls.push(urlData.publicUrl);
          }
        }
      } else {
        const body = await req.json();
        finalPrice = body.finalPrice;
      }

      const { data: job } = await db.from('jobs')
        .update({ status: 'completed', final_price: finalPrice || null, photos: photoUrls })
        .eq('id', jobId)
        .eq('fundi_id', fundi?.id)
        .select()
        .maybeSingle();
      if (!job) return err('Job not found', 404);

      await db.from('job_status_history').insert({ job_id: jobId, from_status: 'in_progress', to_status: 'completed', changed_by: authUser.id });
      await notifyUser(db, job.customer_id, 'Job Completed!', 'Your fundi has marked the job as complete. Please confirm and pay.', 'job_completed', { jobId });

      return json({ job, message: 'Job marked as completed. Awaiting customer confirmation.' });
    }

    // POST /jobs/:id/confirm-completion (customer confirms + triggers payment)
    const confirmMatch = fullPath.match(/^\/([a-f0-9-]{36})\/confirm-completion$/);
    if (confirmMatch && req.method === 'POST') {
      const jobId = confirmMatch[1];
      const { otp } = await req.json();

      const { data: job } = await db.from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('customer_id', authUser.id)
        .maybeSingle();
      if (!job) return err('Job not found', 404);
      if (job.customer_completion_confirmed) return json({ confirmed: true, message: 'Already confirmed' });

      // Validate OTP
      if (job.completion_otp && otp !== job.completion_otp) {
        return err('Invalid OTP. Please check the code provided by your fundi.', 400);
      }

      await db.from('jobs').update({
        customer_completion_confirmed: true,
        completion_confirmed_at: new Date().toISOString(),
        status: 'completed',
      }).eq('id', jobId);

      if (job.fundi_id) {
        const { data: fundi } = await db.from('fundis').select('user_id').eq('id', job.fundi_id).maybeSingle();
        if (fundi) {
          await notifyUser(db, fundi.user_id, 'Customer Confirmed Completion!', 'The customer has confirmed the job. Payment is being processed.', 'completion_confirmed', { jobId });
        }
      }

      return json({ confirmed: true, message: 'Completion confirmed. Please proceed to payment.' });
    }

    // POST /jobs/:id/cancel
    const cancelMatch = fullPath.match(/^\/([a-f0-9-]{36})\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
      const jobId = cancelMatch[1];
      const { reason } = await req.json().catch(() => ({}));
      const { data: job, error } = await db.from('jobs')
        .update({ status: 'cancelled', notes: reason || null })
        .eq('id', jobId)
        .select()
        .maybeSingle();
      if (error) return err(error.message);
      await db.from('job_status_history').insert({ job_id: jobId, from_status: null, to_status: 'cancelled', changed_by: authUser.id });
      return json({ job, message: 'Job cancelled' });
    }

    // POST /jobs/:id/review
    const reviewMatch = fullPath.match(/^\/([a-f0-9-]{36})\/review$/);
    if (reviewMatch && req.method === 'POST') {
      const jobId = reviewMatch[1];
      const { rating, comment } = await req.json();
      if (!rating || rating < 1 || rating > 5) return err('Rating must be between 1 and 5');

      const { data: job } = await db.from('jobs').select('*').eq('id', jobId).eq('customer_id', authUser.id).maybeSingle();
      if (!job) return err('Job not found', 404);
      if (!job.fundi_id) return err('No fundi associated with this job');

      const { data: existing } = await db.from('reviews').select('id').eq('job_id', jobId).maybeSingle();
      if (existing) return err('Review already submitted for this job', 409);

      await db.from('reviews').insert({
        job_id: jobId,
        customer_id: authUser.id,
        fundi_id: job.fundi_id,
        rating,
        comment: comment || null,
      });

      // Recalculate fundi average rating
      const { data: reviews } = await db.from('reviews').select('rating').eq('fundi_id', job.fundi_id);
      if (reviews && reviews.length > 0) {
        const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
        await db.from('fundis').update({ rating: Math.round(avg * 100) / 100, total_reviews: reviews.length }).eq('id', job.fundi_id);
      }

      return json({ message: 'Review submitted. Thank you!' });
    }

    return err('Route not found', 404);
  } catch (e) {
    console.error('[jobs]', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
