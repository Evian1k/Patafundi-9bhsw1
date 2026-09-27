// companyPayoutService.js — company settlement withdrawal execution.
// Money path for company jobs (spec §16): escrow release creates
// company_settlements (pending) → the company requests a withdrawal
// (payouts row, status=requested) → platform staff complete the transfer
// → oldest pending settlements are marked paid FIFO (paid_at + reference).
// Every step is server-authoritative, race-safe (row locks) and audited.
import { transaction, query } from '../db.js';
import { badRequest } from '../utils/http.js';
import { auditLog } from './auditService.js';
import { getPaymentSettings } from './financeService.js';
import { assertValidMpesaPhone } from './mpesaService.js';

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Available withdrawal balance for a company:
 * sum(pending settlement net) − sum(outstanding payout requests).
 * `client` (optional) must be inside the same transaction for locking.
 */
export async function companyAvailableBalance(client, companyId) {
  const runner = client || { query: (sql, params) => query(sql, params) };
  const res = await runner.query(
    `select
       coalesce((select sum(net_amount) from company_settlements
                 where company_id = $1 and status = 'pending'), 0)
       -
       coalesce((select sum(amount) from payouts
                 where company_id = $1 and status in ('requested', 'processing')), 0)
       as available`,
    [companyId],
  );
  return money(res.rows[0]?.available || 0);
}

/**
 * Company withdrawal request. Creates a payouts row (status='requested');
 * settlements stay 'pending' until platform staff complete the transfer —
 * so a refund reversal can still cancel them safely.
 */
export async function requestCompanyWithdrawal({ companyId, actorId, actorRole, amount, mpesaNumber, bankName, bankAccount, idempotencyKey, log }) {
  if (mpesaNumber) {
    // validate shape early — stored for the finance team to action
    assertValidMpesaPhone(mpesaNumber);
  }
  const payout = await transaction(async (client) => {
    // Serialize concurrent withdrawal requests per company (double-payout race).
    await client.query('select id from company_profiles where id = $1 for update', [companyId]);
    if (idempotencyKey) {
      const duplicate = await client.query('select * from payouts where idempotency_key = $1', [idempotencyKey]);
      if (duplicate.rows[0]) return { payout: duplicate.rows[0], idempotent: true };
    }
    const companyRes = await client.query('select * from company_profiles where id = $1', [companyId]);
    const company = companyRes.rows[0];
    if (!company) throw badRequest('Company not found');
    if (company.status !== 'approved') throw badRequest('Company is not approved for payouts');

    const requested = money(amount);
    if (!Number.isFinite(requested) || requested <= 0) throw badRequest('Amount must be greater than zero');
    const settings = await getPaymentSettings(client);
    if (requested < Number(settings.minimumPayoutKes || 0)) {
      throw badRequest('Requested payout is below the minimum payout amount');
    }
    const available = await companyAvailableBalance(client, companyId);
    if (requested > available) {
      throw badRequest(`Requested payout exceeds the available settlement balance (${available})`);
    }

    // Destination: explicit request values win, otherwise the saved account.
    let method = 'mpesa';
    if (!mpesaNumber && (bankName || company.payout_method === 'bank')) method = 'bank';
    const destMpesa = mpesaNumber || (method === 'mpesa' ? company.payout_mpesa_number : null);
    const destBank = method === 'bank' ? { name: bankName || company.payout_bank_name, account: bankAccount || company.payout_bank_account } : null;
    if (method === 'mpesa' && !destMpesa) throw badRequest('An M-Pesa payout number is required');
    if (method === 'bank' && (!destBank?.name || !destBank?.account)) {
      throw badRequest('Bank name and account number are required');
    }

    const result = await client.query(
      `insert into payouts (company_id, amount, mpesa_number, status, idempotency_key, net_amount, currency, protection_snapshot)
       values ($1, $2, $3, 'requested', $4, $5, $6, $7::jsonb) returning *`,
      [
        companyId,
        requested,
        destMpesa,
        idempotencyKey || null,
        requested,
        'KES',
        JSON.stringify({
          providerType: 'company',
          method,
          bank: destBank,
          availableAtRequest: available,
        }),
      ],
    );
    return { payout: result.rows[0], idempotent: false, company, available };
  });

  if (!payout.idempotent) {
    await auditLog({
      userId: actorId,
      action: 'company.payout.request',
      entityType: 'payout',
      entityId: payout.payout.id,
      metadata: { companyId, amount: payout.payout.amount, actorRole },
    });
    const { emitEvent } = await import('../realtime.js');
    emitEvent('payout:requested', { payoutId: payout.payout.id, companyId }, 'staff:ops');
    log?.(`company payout requested: ${payout.payout.id} for ${companyId}`);
  }
  return payout;
}

/**
 * Mark pending settlements paid FIFO up to the payout amount.
 * MUST run inside the completing transaction (settlement rows locked).
 * Returns { settled: [ids], settledAmount }.
 */
export async function markSettlementsPaid(client, companyId, amount, providerReference) {
  const pending = await client.query(
    `select id, net_amount from company_settlements
     where company_id = $1 and status = 'pending'
     order by created_at asc`,
    [companyId],
  );
  let remaining = money(amount);
  const settled = [];
  for (const row of pending.rows) {
    if (remaining <= 0) break;
    const net = money(row.net_amount);
    if (net <= remaining + 0.001) {
      await client.query(
        `update company_settlements
         set status = 'paid', paid_at = now(),
             payout_reference = coalesce($2, payout_reference), updated_at = now()
         where id = $1`,
        [row.id, providerReference],
      );
      settled.push(row.id);
      remaining = money(remaining - net);
    }
  }
  return { settled, settledAmount: money(amount - remaining) };
}

/** Notify the company owner that a payout completed. */
export async function notifyCompanyPayoutCompleted(companyId, payout) {
  const owner = await query('select owner_user_id, company_name from company_profiles where id = $1', [companyId]);
  if (!owner.rows[0]) return;
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'payout_completed', 'Payout Completed', $2, $3::jsonb)`,
    [
      owner.rows[0].owner_user_id,
      `KES ${Number(payout.amount).toLocaleString()} payout has been completed.${payout.provider_reference ? ` Reference: ${payout.provider_reference}.` : ''}`,
      JSON.stringify({ payoutId: payout.id, companyId, amount: payout.amount }),
    ],
  );
  const { emitEvent } = await import('../realtime.js');
  emitEvent('payout:completed', { payoutId: payout.id, companyId }, `user:${owner.rows[0].owner_user_id}`);
}
