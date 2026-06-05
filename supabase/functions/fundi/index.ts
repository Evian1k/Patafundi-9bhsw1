import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json, err } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function admin() { return createClient(supabaseUrl, serviceKey); }

async function getAuthUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = admin();
  const { data: { user } } = await db.auth.getUser(token);
  return user || null;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const fullPath = url.pathname.replace(/^\/functions\/v1\/fundi/, '');
  const db = admin();

  try {
    // ── Public endpoints ───────────────────────────────────────────────

    // GET /fundi/search
    if (fullPath.startsWith('/search') && req.method === 'GET') {
      const lat = parseFloat(url.searchParams.get('latitude') || '0');
      const lon = parseFloat(url.searchParams.get('longitude') || '0');
      const skill = url.searchParams.get('skill') || null;
      const radius = parseFloat(url.searchParams.get('radius') || '15');

      let query = db.from('fundis')
        .select('id, first_name, last_name, skills, rating, total_reviews, online, verification_status, trust_score, bio')
        .eq('verification_status', 'approved')
        .eq('online', true);

      if (skill) query = query.contains('skills', [skill]);

      const { data: fundis } = await query.limit(20);
      return json({ fundis: fundis || [], radius });
    }

    // GET /fundi/:id (public)
    const idMatch = fullPath.match(/^\/([a-f0-9-]{36})$/);
    if (idMatch && req.method === 'GET') {
      const { data: fundi } = await db.from('fundis')
        .select('id, first_name, last_name, skills, rating, total_reviews, bio, trust_score, online, verification_status')
        .eq('id', idMatch[1])
        .maybeSingle();
      if (!fundi) return err('Fundi not found', 404);
      return json({ fundi });
    }

    // GET /fundi/:id/reviews
    const reviewMatch = fullPath.match(/^\/([a-f0-9-]{36})\/reviews$/);
    if (reviewMatch && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const { data: reviews } = await db.from('reviews')
        .select('id, rating, comment, created_at, customer_id')
        .eq('fundi_id', reviewMatch[1])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      return json({ reviews: reviews || [] });
    }

    // ── Authenticated endpoints ──────────────────────────────────────
    const authUser = await getAuthUser(req);
    if (!authUser) return err('Unauthorized', 401);

    // GET /fundi/profile
    if (fullPath === '/profile' && req.method === 'GET') {
      const { data: fundi } = await db.from('fundis').select('*').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return err('Fundi profile not found', 404);
      return json({ fundi });
    }

    // PUT /fundi/profile
    if (fullPath === '/profile' && req.method === 'PUT') {
      const body = await req.json();
      const { data: existing } = await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle();
      if (!existing) return err('Fundi profile not found', 404);
      const { data, error } = await db.from('fundis').update({
        bio: body.bio,
        skills: body.skills,
        phone: body.phone,
      }).eq('user_id', authUser.id).select().maybeSingle();
      if (error) return err(error.message);
      return json({ fundi: data });
    }

    // GET /fundi/approval-status
    if (fullPath === '/approval-status' && req.method === 'GET') {
      const { data: fundi } = await db.from('fundis').select('verification_status, created_at').eq('user_id', authUser.id).maybeSingle();
      return json({ status: fundi?.verification_status || 'not_registered', fundi });
    }

    // GET /fundi/dashboard
    if (fullPath === '/dashboard' && req.method === 'GET') {
      const { data: profile } = await db.from('user_profiles').select('role').eq('id', authUser.id).maybeSingle();
      if (profile?.role !== 'fundi' && profile?.role !== 'fundi_pending') {
        return err('Access denied', 403);
      }
      const { data: fundi } = await db.from('fundis').select('*').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return err('Fundi profile not found. Please complete registration.', 404);

      const { count: activeCount } = await db.from('jobs').select('id', { count: 'exact', head: true })
        .eq('fundi_id', fundi.id).in('status', ['accepted', 'on_the_way', 'arrived', 'in_progress']);
      const { count: completedCount } = await db.from('jobs').select('id', { count: 'exact', head: true })
        .eq('fundi_id', fundi.id).eq('status', 'completed');
      const { count: newCount } = await db.from('jobs').select('id', { count: 'exact', head: true })
        .is('fundi_id', null).eq('status', 'pending');

      return json({
        dashboard: {
          verificationStatus: fundi.verification_status,
          profileCompletion: fundi.profile_completion || 70,
          online: fundi.online,
          walletBalance: fundi.wallet_balance || 0,
          jobStats: {
            newRequests: newCount || 0,
            activeJobs: activeCount || 0,
            completedJobs: completedCount || 0,
          },
          ratings: {
            average: fundi.rating || 0,
            total: fundi.total_reviews || 0,
          },
        },
      });
    }

    // GET /fundi/status
    if (fullPath === '/status' && req.method === 'GET') {
      const { data: fundi } = await db.from('fundis').select('online, subscription_active, subscription_expires_at').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return json({ status: { online: false, subscriptionActive: false } });

      const daysLeft = fundi.subscription_expires_at
        ? Math.max(0, Math.ceil((new Date(fundi.subscription_expires_at).getTime() - Date.now()) / 86400000))
        : 0;

      return json({
        status: {
          online: fundi.online,
          subscriptionActive: fundi.subscription_active && daysLeft > 0,
          daysLeft,
          expiresAt: fundi.subscription_expires_at,
        },
      });
    }

    // POST /fundi/status/online
    if (fullPath === '/status/online' && req.method === 'POST') {
      const { latitude, longitude, accuracy } = await req.json();
      const { data: fundi } = await db.from('fundis').select('id, subscription_active, subscription_expires_at, verification_status').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return err('Fundi profile not found', 404);
      if (fundi.verification_status !== 'approved') return err('Your account is pending approval', 403);

      const daysLeft = fundi.subscription_expires_at
        ? Math.ceil((new Date(fundi.subscription_expires_at).getTime() - Date.now()) / 86400000)
        : 0;
      if (!fundi.subscription_active || daysLeft <= 0) return err('Please activate your subscription to go online', 403);

      await db.from('fundis').update({ online: true, last_seen: new Date().toISOString() }).eq('id', fundi.id);
      if (latitude && longitude) {
        await db.from('fundi_locations').insert({ fundi_id: fundi.id, latitude, longitude, accuracy_meters: accuracy || null });
      }
      return json({ online: true, message: 'You are now online' });
    }

    // POST /fundi/status/offline
    if (fullPath === '/status/offline' && req.method === 'POST') {
      const { data: fundi } = await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle();
      if (fundi) await db.from('fundis').update({ online: false }).eq('id', fundi.id);
      return json({ online: false, message: 'You are now offline' });
    }

    // POST /fundi/location
    if (fullPath === '/location' && req.method === 'POST') {
      const { latitude, longitude, accuracy } = await req.json();
      const { data: fundi } = await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return err('Not found', 404);
      await db.from('fundi_locations').insert({ fundi_id: fundi.id, latitude, longitude, accuracy_meters: accuracy || null });
      await db.from('fundis').update({ last_seen: new Date().toISOString() }).eq('id', fundi.id);
      return json({ updated: true });
    }

    // POST /fundi/register
    if (fullPath === '/register' && req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';
      let body: Record<string, string> = {};
      let idFrontUrl = '', idBackUrl = '', selfieUrl = '';

      if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
        
        const uploadFile = async (field: string, path: string) => {
          const file = form.get(field) as File | null;
          if (!file) return '';
          const { data } = await db.storage.from('fundi-documents').upload(
            `${authUser.id}/${path}-${Date.now()}`,
            file,
            { upsert: true, contentType: file.type }
          );
          if (!data) return '';
          const { data: urlData } = db.storage.from('fundi-documents').getPublicUrl(data.path);
          return urlData.publicUrl;
        };

        idFrontUrl = await uploadFile('idFront', 'id-front');
        idBackUrl = await uploadFile('idBack', 'id-back');
        selfieUrl = await uploadFile('selfie', 'selfie');
      } else {
        body = await req.json();
      }

      const profile = await db.from('user_profiles').select('*').eq('id', authUser.id).maybeSingle();

      const { data: existing } = await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle();

      const fundiData = {
        user_id: authUser.id,
        first_name: body.firstName || profile.data?.full_name?.split(' ')[0] || '',
        last_name: body.lastName || profile.data?.full_name?.split(' ').slice(1).join(' ') || '',
        phone: body.phone || profile.data?.phone || '',
        skills: body.skills ? JSON.parse(body.skills) : [],
        bio: body.bio || '',
        id_number: body.idNumber || '',
        id_front_url: idFrontUrl,
        id_back_url: idBackUrl,
        selfie_url: selfieUrl,
        verification_status: 'pending',
        profile_completion: 80,
      };

      let fundiId: string;
      if (existing) {
        const { data } = await db.from('fundis').update(fundiData).eq('user_id', authUser.id).select('id').maybeSingle();
        fundiId = data?.id;
      } else {
        const { data } = await db.from('fundis').insert(fundiData).select('id').maybeSingle();
        fundiId = data?.id;
      }

      await db.from('user_profiles').update({ role: 'fundi_pending' }).eq('id', authUser.id);

      return json({
        message: 'Registration submitted for review. You will be notified within 24 hours.',
        fundiId,
      });
    }

    // GET /fundi/wallet/transactions
    if (fullPath.startsWith('/wallet/transactions') && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const { data: fundi } = await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return json({ transactions: [] });
      const { data: txs } = await db.from('wallet_transactions')
        .select('*')
        .eq('fundi_id', fundi.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      return json({ transactions: txs || [] });
    }

    // POST /fundi/wallet/withdraw-request
    if (fullPath === '/wallet/withdraw-request' && req.method === 'POST') {
      const { amount, mpesaNumber } = await req.json();
      if (!amount || amount <= 0) return err('Invalid withdrawal amount');
      if (!mpesaNumber) return err('M-Pesa number required');

      const { data: fundi } = await db.from('fundis').select('id, wallet_balance, trust_score, subscription_active').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return err('Fundi profile not found', 404);
      if (fundi.wallet_balance < amount) return err(`Insufficient balance. Available: KES ${fundi.wallet_balance}`);
      if (fundi.trust_score < 30) return err('Withdrawal blocked due to low trust score. Contact support.');

      const { data: wr, error } = await db.from('withdrawal_requests').insert({
        fundi_id: fundi.id,
        amount,
        mpesa_number: mpesaNumber,
        status: 'pending',
      }).select().maybeSingle();
      if (error) return err(error.message);

      return json({
        message: `Withdrawal request of KES ${amount} submitted. Processing within 24 hours.`,
        request: wr,
      });
    }

    // GET /fundi/ratings
    if (fullPath.startsWith('/ratings') && req.method === 'GET') {
      const { data: fundi } = await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return json({ ratings: [] });
      const { data: ratings } = await db.from('reviews')
        .select('id, rating, comment, created_at')
        .eq('fundi_id', fundi.id)
        .order('created_at', { ascending: false })
        .limit(10);
      return json({ ratings: ratings || [] });
    }

    return err('Route not found', 404);
  } catch (e) {
    console.error('[fundi]', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
