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

const PLANS: Record<string, { days: number; amount: number; label: string }> = {
  weekly: { days: 7, amount: 200, label: 'Weekly Plan' },
  monthly: { days: 30, amount: 600, label: 'Monthly Plan' },
  quarterly: { days: 90, amount: 1500, label: 'Quarterly Plan' },
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const fullPath = url.pathname.replace(/^\/functions\/v1\/subscriptions/, '');
  const db = admin();

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return err('Unauthorized', 401);

    // POST /subscriptions/activate
    if (fullPath === '/activate' && req.method === 'POST') {
      const { plan = 'monthly' } = await req.json().catch(() => ({}));
      const planConfig = PLANS[plan] || PLANS.monthly;

      const { data: fundi } = await db.from('fundis').select('id, verification_status').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return err('Fundi profile not found', 404);
      if (fundi.verification_status !== 'approved') return err('Account must be approved before activating subscription', 403);

      const expiresAt = new Date(Date.now() + planConfig.days * 86400000).toISOString();

      await db.from('subscriptions').insert({
        fundi_id: fundi.id,
        plan,
        status: 'active',
        amount_paid: planConfig.amount,
        expires_at: expiresAt,
      });

      await db.from('fundis').update({
        subscription_active: true,
        subscription_expires_at: expiresAt,
      }).eq('id', fundi.id);

      return json({
        message: `${planConfig.label} activated. Valid until ${new Date(expiresAt).toLocaleDateString('en-KE')}`,
        expiresAt,
        plan,
      });
    }

    // GET /subscriptions/plans
    if (fullPath === '/plans' && req.method === 'GET') {
      return json({
        plans: Object.entries(PLANS).map(([key, p]) => ({
          key, ...p,
        })),
      });
    }

    return err('Route not found', 404);
  } catch (e) {
    console.error('[subscriptions]', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
