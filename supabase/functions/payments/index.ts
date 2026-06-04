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
      const idempotencyKey = req.headers.get('Idempotency-Key');

      if (!mpesaNumber) return err('M-Pesa number required');
      if (!idempotencyKey) return err('Idempotency-Key header required for payments', 400);

      const { data: job } = await db.from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('customer_id', authUser.id)
        .maybeSingle();
      if (!job) return err('Job not found', 404);
      if (!job.customer_completion_confirmed) return err('Please confirm job completion before paying', 400);

      // Check for idempotent resubmission
      const { data: idempotent } = await db.from('payments')
        .select('id, status, amount')
        .eq('job_id', jobId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (idempotent) {
        // Already processed with this key, return cached response
        return json({
          message: 'Payment already initiated',
          checkoutRequestId: 'cached_' + idempotent.id,
          payment: { id: idempotent.id, status: idempotent.status, amount: idempotent.amount },
        });
      }

      // CRITICAL: Check for duplicate payment with enhanced checks
      const { data: existing } = await db.from('payments')
        .select('id, status')
        .eq('job_id', jobId)
        .not('status', 'in', '("failed","cancelled")')  // Allow only truly failed/cancelled
        .maybeSingle();
      if (existing) {
        return err(
          `Payment already ${existing.status === 'processing' ? 'processing' : 'processed'} for this job. ` +
          `Cannot initiate duplicate payment. Contact support if needed.`,
          409
        );
      }

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
        idempotency_key: idempotencyKey,  // ← ADDED: Track idempotency
      }).select().maybeSingle();
      if (payErr) return err(payErr.message, 400);

      // Simulate M-Pesa STK push (auto-confirm after 5 seconds in background)
      // In production, this would call Daraja API
      const mpesaApiKey = Deno.env.get('MPESA_CONSUMER_KEY');
      
      if (mpesaApiKey) {
        // PRODUCTION: Real M-Pesa Daraja API integration
        console.log(`[payments] CRITICAL: Real M-Pesa integration required!`);
        console.log(`[payments] TODO: Send STK push to ${mpesaNumber} for KES ${amount}`);
        
        // TODO: Implement actual Daraja API call:
        // 1. Get access token from Daraja
        // 2. Call POST /mpesa/stkpush/v1/processrequest
        // 3. Handle response with checkout_request_id
        // 4. Daraja will callback to /payments/daraja-callback
        // 5. Only update payment status on verified callback
        
        // For now, return error to prevent demo-mode payments in production
        console.error(
          '[SECURITY] M-Pesa Daraja API not fully implemented! ' +
          'Payments cannot be processed. This is a critical blocker for production.'
        );
        
        return err(
          'M-Pesa payment processing is not yet fully configured for production. ' +
          'Please contact support. Do not attempt to send money through the app yet.',
          503
        );
      } else {
        // DEMO MODE: Auto-confirm after short delay (DEV ONLY!)
        console.warn(
          '[WARNING] Running in DEMO MODE. Payments will auto-confirm after 3 seconds. ' +
          'This is NOT PRODUCTION READY!'
        );
        
        setTimeout(async () => {
          const receipt = mockMpesaReceipt();
          await db.from('payments').update({
            status: 'completed',
            mpesa_receipt_number: receipt,
            escrow_status: 'held',
            payout_approval_status: 'pending',
          }).eq('id', payment!.id);

          await db.from('jobs').update({ payment_status: 'paid' }).eq('id', jobId);

          // Log demo payment
          await db.from('audit_logs').insert({
            action: 'demo_payment_auto_confirmed',  // ← Mark as DEMO
            resource_type: 'payment',
            resource_id: payment!.id,
            details: { 
              amount, 
              receipt: '(DEMO) ' + receipt, 
              jobId,
              warning: 'This payment was auto-confirmed in demo mode and is NOT a real M-Pesa transaction'
            },
          });
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

    // POST /payments/daraja-callback - M-Pesa callback endpoint
    // CRITICAL: This receives callbacks from M-Pesa Daraja API
    if (fullPath === '/daraja-callback' && req.method === 'POST') {
      const body = await req.json();
      console.log('[payments/callback] Received M-Pesa callback:', body);

      // SECURITY REQUIREMENT: Verify HMAC signature
      const signature = req.headers.get('X-Signature');
      const callbackTimestamp = req.headers.get('X-Timestamp');
      const hmacKey = Deno.env.get('MPESA_CALLBACK_HMAC_KEY');

      if (!signature || !hmacKey) {
        console.error('[payments/callback] ❌ Missing signature or HMAC key - REJECTING CALLBACK');
        return json({ error: 'Signature verification required' }, { status: 401 });
      }

      // TODO: Implement HMAC verification
      // const verified = verifyMpesaSignature(body, signature, hmacKey);
      // if (!verified) return json({ error: 'Invalid signature' }, { status: 401 });

      // Extract payment details from M-Pesa callback
      const checkoutRequestId = body.CheckoutRequestID || body.checkoutRequestId;
      const resultCode = body.ResultCode || body.resultCode;  // 0 = success
      const mpesaReceiptNumber = body.MpesaReceiptNumber || body.mpesaReceiptNumber;

      if (!checkoutRequestId) {
        return json({ error: 'Invalid callback format' }, { status: 400 });
      }

      // Find payment by checkout_request_id
      const { data: payment } = await db
        .from('payments')
        .select('*')
        .eq('checkout_request_id', checkoutRequestId)
        .maybeSingle();

      if (!payment) {
        console.warn(`[payments/callback] Payment not found for checkout_request_id: ${checkoutRequestId}`);
        return json({ error: 'Payment not found' }, { status: 404 });
      }

      if (resultCode === 0 || resultCode === '0') {
        // SUCCESS: Payment confirmed by M-Pesa
        console.log(`[payments/callback] ✅ Payment confirmed: ${mpesaReceiptNumber}`);

        await db.from('payments').update({
          status: 'completed',
          mpesa_receipt_number: mpesaReceiptNumber,
          escrow_status: 'held',
          payout_approval_status: 'pending',
          callback_received_at: new Date().toISOString(),
        }).eq('id', payment.id);

        // Mark job as paid
        await db.from('jobs').update({ payment_status: 'paid' }).eq('id', payment.job_id);

        // Log successful payment
        await db.from('audit_logs').insert({
          action: 'payment_verified_by_mpesa',
          resource_type: 'payment',
          resource_id: payment.id,
          details: {
            checkoutRequestId,
            mpesaReceiptNumber,
            amount: payment.amount,
            jobId: payment.job_id,
            verificationTime: callbackTimestamp,
          },
        });

        // Notify fundi
        await db.from('notifications').insert({
          user_id: (
            await db.from('fundis')
              .select('user_id')
              .eq('id', payment.fundi_id)
              .maybeSingle()
          ).data?.user_id,
          title: 'Payment Received! 🎉',
          body: `Customer paid KES ${payment.amount} for job. Fundi payout: KES ${payment.fundi_payout}`,
          type: 'payment_received',
          data: { paymentId: payment.id },
        });

        return json({ status: 'success', message: 'Payment confirmed and held in escrow' });
      } else {
        // FAILURE: Payment failed in M-Pesa
        console.log(`[payments/callback] ❌ Payment failed with code: ${resultCode}`);

        await db.from('payments').update({
          status: 'failed',
          escrow_status: 'released',
          error_code: resultCode,
          callback_received_at: new Date().toISOString(),
        }).eq('id', payment.id);

        // Log failed payment
        await db.from('audit_logs').insert({
          action: 'payment_failed_at_mpesa',
          resource_type: 'payment',
          resource_id: payment.id,
          details: {
            checkoutRequestId,
            resultCode,
            amount: payment.amount,
            jobId: payment.job_id,
          },
        });

        // Notify customer
        await db.from('notifications').insert({
          user_id: payment.customer_id,
          title: 'Payment Failed',
          body: 'Your M-Pesa payment was declined. Please try again.',
          type: 'payment_failed',
          data: { paymentId: payment.id },
        });

        return json({ status: 'failed', message: 'Payment failed - customer notified' });
      }
    }

    return err('Route not found', 404);
  } catch (e) {
    console.error('[payments]', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
