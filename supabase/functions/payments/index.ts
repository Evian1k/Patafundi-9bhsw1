import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json, err } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const COMMISSION_RATE = 0.15; // 15% platform commission

function admin() { return createClient(supabaseUrl, serviceKey); }

async function getAuthUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await admin().auth.getUser(token);
  return user || null;
}

function mockMpesaReceipt() {
  return 'PF' + Date.now().toString(36).toUpperCase().slice(-8);
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const fullPath = url.pathname.replace(/^\/functions\/v1\/payments/, '');
  const db = admin();

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return err('Unauthorized', 401);

    // GET /payments/wallet/balance
    if (fullPath === '/wallet/balance' && req.method === 'GET') {
      const { data: fundi } = await db.from('fundis').select('wallet_balance').eq('user_id', authUser.id).maybeSingle();
      if (!fundi) return err('Fundi not found', 404);

      const { data: pending } = await db.from('payments')
        .select('fundi_payout')
        .eq('fundi_id', (await db.from('fundis').select('id').eq('user_id', authUser.id).maybeSingle()).data?.id)
        .eq('escrow_status', 'held')
        .neq('status', 'cancelled');

      const escrowPending = (pending || []).reduce((s, p) => s + (p.fundi_payout || 0), 0);

      return json({
        balance: fundi.wallet_balance || 0,
        escrowPending,
        available: Math.max(0, (fundi.wallet_balance || 0) - escrowPending),
      });
    }

    // GET /payments/job/:jobId
    const jobPayMatch = fullPath.match(/^\/job\/([a-f0-9-]{36})$/);
    if (jobPayMatch && req.method === 'GET') {
      const jobId = jobPayMatch[1];
      const { data: payment } = await db.from('payments')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ payment });
    }

    // POST /payments/process/:jobId  — trigger M-Pesa STK push
    const processMatch = fullPath.match(/^\/process\/([a-f0-9-]{36})$/);
    if (processMatch && req.method === 'POST') {
      const jobId = processMatch[1];
      const { mpesaNumber, paymentMethod = 'mpesa' } = await req.json();

      if (!mpesaNumber) return err('M-Pesa number required');

      const { data: job } = await db.from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('customer_id', authUser.id)
        .maybeSingle();
      if (!job) return err('Job not found', 404);
      if (!job.customer_completion_confirmed) return err('Please confirm job completion before paying', 400);

      // Check for duplicate payment
      const { data: existing } = await db.from('payments')
        .select('id, status')
        .eq('job_id', jobId)
        .in('status', ['completed', 'confirmed', 'processing'])
        .maybeSingle();
      if (existing) return err('Payment already processed for this job', 409);

      const amount = Number(job.final_price || job.estimated_price || 0);
      if (amount <= 0) return err('Invalid payment amount. Please contact support.');

      const commission = Math.round(amount * COMMISSION_RATE * 100) / 100;
      const fundiPayout = Math.round((amount - commission) * 100) / 100;
      const checkoutRequestId = 'ws_CO_' + Date.now();

      // Create payment record
      const { data: payment, error: payErr } = await db.from('payments').insert({
        job_id: jobId,
        customer_id: authUser.id,
        fundi_id: job.fundi_id,
        amount,
        platform_commission: commission,
        fundi_payout: fundiPayout,
        mpesa_number: mpesaNumber,
        payment_method: paymentMethod,
        status: 'processing',
        escrow_status: 'pending',
        checkout_request_id: checkoutRequestId,
      }).select().maybeSingle();
      if (payErr) return err(payErr.message, 400);

      // Simulate M-Pesa STK push (auto-confirm after 5 seconds in background)
      // In production, this would call Daraja API
      const mpesaApiKey = Deno.env.get('MPESA_CONSUMER_KEY');
      
      if (mpesaApiKey) {
        // TODO: Real M-Pesa Daraja API integration
        console.log(`[payments] Would send STK push to ${mpesaNumber} for KES ${amount}`);
      } else {
        // Demo mode: auto-confirm after short delay
        setTimeout(async () => {
          const receipt = mockMpesaReceipt();
          await db.from('payments').update({
            status: 'completed',
            mpesa_receipt_number: receipt,
            escrow_status: 'held',
            payout_approval_status: 'pending',
          }).eq('id', payment!.id);

          await db.from('jobs').update({ payment_status: 'paid' }).eq('id', jobId);

          // Bypass detection: check if payment came through platform
          if (job.customer_completion_confirmed) {
            await db.from('audit_logs').insert({
              action: 'payment_received',
              resource_type: 'payment',
              resource_id: payment!.id,
              details: { amount, receipt, jobId },
            });
          }
        }, 3000);
      }

      return json({
        message: 'M-Pesa STK push sent. Enter your PIN to complete payment.',
        checkoutRequestId,
        payment: { id: payment!.id, status: 'processing', amount },
      });
    }

    // GET /payments/escrow/:jobId
    const escrowMatch = fullPath.match(/^\/escrow\/([a-f0-9-]{36})$/);
    if (escrowMatch && req.method === 'GET') {
      const jobId = escrowMatch[1];
      const { data: payment } = await db.from('payments')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({
        escrow: payment
          ? {
              amount: payment.amount,
              commission: payment.platform_commission,
              fundiPayout: payment.fundi_payout,
              status: payment.escrow_status,
              payoutApprovalStatus: payment.payout_approval_status,
              receipt: payment.mpesa_receipt_number,
            }
          : null,
      });
    }

    return err('Route not found', 404);
  } catch (e) {
    console.error('[payments]', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
