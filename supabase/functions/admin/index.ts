import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json, err } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function admin() { return createClient(supabaseUrl, serviceKey); }

async function getAdminUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = admin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await db.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return null;
  return user;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const fullPath = url.pathname.replace(/^\/functions\/v1\/admin/, '');
  const db = admin();

  try {
    const adminUser = await getAdminUser(req);
    if (!adminUser) return err('Forbidden — Admin access required', 403);

    // GET /admin/dashboard (stats)
    if (fullPath === '/dashboard' && req.method === 'GET') {
      const [
        { count: totalJobs },
        { count: activeJobs },
        { count: totalFundis },
        { count: pendingFundis },
        { data: revenueData },
        { count: openDisputes },
        { count: totalUsers },
      ] = await Promise.all([
        db.from('jobs').select('id', { count: 'exact', head: true }),
        db.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['accepted', 'in_progress', 'on_the_way']),
        db.from('fundis').select('id', { count: 'exact', head: true }),
        db.from('fundis').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
        db.from('payments').select('amount').eq('status', 'completed'),
        db.from('disputes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        db.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
      ]);

      const totalRevenue = (revenueData || []).reduce((s, p) => s + Number(p.amount), 0);
      const { data: commissions } = await db.from('payments').select('platform_commission').eq('status', 'completed');
      const totalCommission = (commissions || []).reduce((s, p) => s + Number(p.platform_commission), 0);

      return json({
        stats: {
          totalJobs, activeJobs, totalFundis, pendingFundis,
          totalRevenue, totalCommission, openDisputes, totalUsers,
        },
      });
    }

    // GET /admin/fundis (verification queue)
    if (fullPath === '/fundis' && req.method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const status = url.searchParams.get('status') || 'pending';
      const limit = 20;
      const offset = (page - 1) * limit;
      const { data: fundis, count } = await db.from('fundis')
        .select('*, user_profiles!fundis_user_id_fkey(email, phone)', { count: 'exact' })
        .eq('verification_status', status)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      return json({ fundis: fundis || [], total: count || 0, page });
    }

    // POST /admin/fundis/:id/approve
    const approveMatch = fullPath.match(/^\/fundis\/([a-f0-9-]{36})\/approve$/);
    if (approveMatch && req.method === 'POST') {
      const fundiId = approveMatch[1];
      const { data: fundi } = await db.from('fundis').update({ verification_status: 'approved' }).eq('id', fundiId).select('user_id').maybeSingle();
      if (fundi) {
        await db.from('user_profiles').update({ role: 'fundi' }).eq('id', fundi.user_id);
        await db.from('notifications').insert({
          user_id: fundi.user_id,
          title: 'Account Approved! 🎉',
          body: 'Your PataFundi account has been approved. You can now go online and accept jobs.',
          type: 'approval',
        });
      }
      await db.from('audit_logs').insert({ actor_id: adminUser.id, action: 'fundi_approved', resource_type: 'fundi', resource_id: fundiId });
      return json({ message: 'Fundi approved successfully' });
    }

    // POST /admin/fundis/:id/reject
    const rejectMatch = fullPath.match(/^\/fundis\/([a-f0-9-]{36})\/reject$/);
    if (rejectMatch && req.method === 'POST') {
      const fundiId = rejectMatch[1];
      const { reason } = await req.json().catch(() => ({}));
      const { data: fundi } = await db.from('fundis').update({ verification_status: 'rejected' }).eq('id', fundiId).select('user_id').maybeSingle();
      if (fundi) {
        await db.from('notifications').insert({
          user_id: fundi.user_id,
          title: 'Application Declined',
          body: reason || 'Your application did not meet our verification requirements. You may reapply.',
          type: 'rejection',
        });
      }
      await db.from('audit_logs').insert({ actor_id: adminUser.id, action: 'fundi_rejected', resource_type: 'fundi', resource_id: fundiId, details: { reason } });
      return json({ message: 'Fundi rejected' });
    }

    // GET /admin/customers
    if (fullPath === '/customers' && req.method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = 20;
      const offset = (page - 1) * limit;
      const { data: customers, count } = await db.from('user_profiles')
        .select('id, email, full_name, phone, trust_score, is_active, created_at', { count: 'exact' })
        .eq('role', 'customer')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      return json({ customers: customers || [], total: count || 0, page });
    }

    // GET /admin/jobs
    if (fullPath === '/jobs' && req.method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const status = url.searchParams.get('status') || null;
      const limit = 20;
      const offset = (page - 1) * limit;
      let query = db.from('jobs')
        .select('*, user_profiles!jobs_customer_id_fkey(email, full_name), fundis(first_name, last_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (status) query = query.eq('status', status);
      const { data: jobs, count } = await query;
      return json({ jobs: jobs || [], total: count || 0, page });
    }

    // GET /admin/payments
    if (fullPath === '/payments' && req.method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = 20;
      const offset = (page - 1) * limit;
      const { data: payments, count } = await db.from('payments')
        .select('*, jobs(service_category, status), user_profiles!payments_customer_id_fkey(email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      return json({ payments: payments || [], total: count || 0, page });
    }

    // GET /admin/disputes
    if (fullPath === '/disputes' && req.method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const status = url.searchParams.get('status') || null;
      const limit = 20;
      const offset = (page - 1) * limit;
      let query = db.from('disputes')
        .select('*, dispute_evidence(*), dispute_timeline(*), jobs(service_category, estimated_price)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (status) query = query.eq('status', status);
      const { data: disputes, count } = await query;

      // Enrich with names
      const enriched = await Promise.all((disputes || []).map(async (d) => {
        const [custProfile, fundiProfile] = await Promise.all([
          d.customer_id ? db.from('user_profiles').select('full_name, email, trust_score').eq('id', d.customer_id).maybeSingle() : { data: null },
          d.fundi_id ? db.from('fundis').select('first_name, last_name, trust_score').eq('id', d.fundi_id).maybeSingle() : { data: null },
        ]);
        return {
          ...d,
          customerName: custProfile.data?.full_name || custProfile.data?.email || 'Customer',
          customerTrustScore: custProfile.data?.trust_score,
          fundiName: fundiProfile.data ? `${fundiProfile.data.first_name} ${fundiProfile.data.last_name}` : 'Fundi',
          fundiTrustScore: fundiProfile.data?.trust_score,
          amount: d.jobs?.estimated_price,
          evidence: d.dispute_evidence,
          timeline: d.dispute_timeline?.map((t: Record<string, unknown>) => ({
            id: t.id,
            action: t.action,
            actor: t.actor,
            actorRole: t.actor_role,
            timestamp: t.created_at,
            note: t.note,
          })),
        };
      }));

      return json({ disputes: enriched, total: count || 0, page });
    }

    // POST /admin/disputes/:id/resolve
    const resolveMatch = fullPath.match(/^\/disputes\/([a-f0-9-]{36})\/resolve$/);
    if (resolveMatch && req.method === 'POST') {
      const disputeId = resolveMatch[1];
      const body = await req.json();
      const resolution = body.resolution || '';
      const refundAmount = body.refundAmount;

      const outcomeMap: Record<string, string> = {
        customer_won: 'customer_won',
        fundi_won: 'fundi_won',
        resolved: 'resolved',
      };
      const outcome = Object.keys(outcomeMap).find((k) => resolution.startsWith(k)) || 'resolved';

      await db.from('disputes').update({
        status: outcome,
        resolution,
        resolved_by: adminUser.id,
        resolved_at: new Date().toISOString(),
      }).eq('id', disputeId);

      await db.from('dispute_timeline').insert({
        dispute_id: disputeId,
        action: `Resolved: ${outcome.replace('_', ' ')}`,
        actor: adminUser.email || 'Admin',
        actor_role: 'admin',
        note: resolution,
      });

      await db.from('audit_logs').insert({
        actor_id: adminUser.id,
        action: 'dispute_resolved',
        resource_type: 'dispute',
        resource_id: disputeId,
        details: { outcome, refundAmount },
      });

      return json({ message: 'Dispute resolved', outcome });
    }

    // GET /admin/escrow-queue
    if (fullPath === '/escrow-queue' && req.method === 'GET') {
      const { data: payments } = await db.from('payments')
        .select('*, jobs(service_category, customer_id, fundi_id), user_profiles!payments_customer_id_fkey(email, full_name)')
        .eq('escrow_status', 'held')
        .eq('payout_approval_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      return json({ payments: payments || [] });
    }

    // POST /admin/escrow/:jobId/release
    const escrowReleaseMatch = fullPath.match(/^\/escrow\/([a-f0-9-]{36})\/release$/);
    if (escrowReleaseMatch && req.method === 'POST') {
      const jobId = escrowReleaseMatch[1];
      const { data: payment } = await db.from('payments')
        .select('*')
        .eq('job_id', jobId)
        .eq('escrow_status', 'held')
        .maybeSingle();
      if (!payment) return err('Payment not found', 404);

      await db.from('payments').update({
        escrow_status: 'released',
        payout_approval_status: 'approved',
        payout_released_at: new Date().toISOString(),
      }).eq('id', payment.id);

      if (payment.fundi_id) {
        const { data: fundi } = await db.from('fundis').select('wallet_balance, user_id').eq('id', payment.fundi_id).maybeSingle();
        if (fundi) {
          const newBalance = (fundi.wallet_balance || 0) + payment.fundi_payout;
          await db.from('fundis').update({ wallet_balance: newBalance }).eq('id', payment.fundi_id);
          await db.from('wallet_transactions').insert({
            fundi_id: payment.fundi_id,
            job_id: jobId,
            type: 'payout',
            amount: payment.fundi_payout,
            balance_after: newBalance,
            description: `Job payout (platform kept ${payment.platform_commission} commission)`,
            status: 'completed',
            reference: payment.mpesa_receipt_number || 'N/A',
          });
          await db.from('notifications').insert({
            user_id: fundi.user_id,
            title: 'Payout Released! 💰',
            body: `KES ${payment.fundi_payout} has been added to your wallet.`,
            type: 'payout',
            data: { amount: payment.fundi_payout, jobId },
          });
        }
      }

      await db.from('audit_logs').insert({
        actor_id: adminUser.id,
        action: 'escrow_released',
        resource_type: 'payment',
        resource_id: payment.id,
        details: { amount: payment.fundi_payout, jobId },
      });

      return json({ message: 'Escrow released. Fundi wallet updated.' });
    }

    // POST /admin/escrow/:jobId/freeze
    const escrowFreezeMatch = fullPath.match(/^\/escrow\/([a-f0-9-]{36})\/freeze$/);
    if (escrowFreezeMatch && req.method === 'POST') {
      const jobId = escrowFreezeMatch[1];
      const { reason } = await req.json().catch(() => ({}));
      await db.from('payments').update({ escrow_status: 'frozen' }).eq('job_id', jobId);
      await db.from('audit_logs').insert({
        actor_id: adminUser.id,
        action: 'escrow_frozen',
        resource_type: 'job',
        resource_id: jobId,
        details: { reason },
      });
      return json({ message: 'Escrow frozen' });
    }

    // GET /admin/trust-scores
    if (fullPath === '/trust-scores' && req.method === 'GET') {
      const { data: users } = await db.from('user_profiles')
        .select('id, email, full_name, role, trust_score, created_at')
        .order('trust_score', { ascending: true })
        .limit(50);
      return json({ users: users || [] });
    }

    // GET /admin/bypass-alerts
    if (fullPath === '/bypass-alerts' && req.method === 'GET') {
      const { data: alerts } = await db.from('bypass_alerts')
        .select('*, jobs(service_category)')
        .order('created_at', { ascending: false })
        .limit(50);
      return json({ alerts: alerts || [] });
    }

    // GET /admin/audit-logs
    if (fullPath === '/audit-logs' && req.method === 'GET') {
      const { data: logs } = await db.from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      return json({ logs: logs || [] });
    }

    // GET /admin/reports/analytics
    if (fullPath === '/reports/analytics' && req.method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '30');
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const [
        { data: dailyJobs },
        { data: dailyRevenue },
        { data: categoryBreakdown },
      ] = await Promise.all([
        db.from('jobs').select('created_at, status').gte('created_at', since),
        db.from('payments').select('amount, platform_commission, created_at').eq('status', 'completed').gte('created_at', since),
        db.from('jobs').select('service_category').gte('created_at', since),
      ]);

      const categoryCounts: Record<string, number> = {};
      (categoryBreakdown || []).forEach((j) => {
        categoryCounts[j.service_category] = (categoryCounts[j.service_category] || 0) + 1;
      });

      return json({
        totalJobs: dailyJobs?.length || 0,
        totalRevenue: (dailyRevenue || []).reduce((s, p) => s + Number(p.amount), 0),
        totalCommission: (dailyRevenue || []).reduce((s, p) => s + Number(p.platform_commission), 0),
        categoryBreakdown: Object.entries(categoryCounts).map(([name, count]) => ({ name, count })),
        days,
      });
    }

    // GET /admin/security/overview
    if (fullPath === '/security/overview' && req.method === 'GET') {
      const { count: bypassCount } = await db.from('bypass_alerts').select('id', { count: 'exact', head: true }).eq('resolved', false);
      const { count: suspendedCount } = await db.from('user_profiles').select('id', { count: 'exact', head: true }).eq('is_active', false);
      return json({ bypassAlerts: bypassCount || 0, suspendedAccounts: suspendedCount || 0 });
    }

    return err('Route not found', 404);
  } catch (e) {
    console.error('[admin]', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
