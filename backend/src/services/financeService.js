const DEFAULT_PAYMENTS = {
  commissionRate: 0.15,
  commissionType: 'percentage',
  fixedCommissionKes: 0,
  categoryCommissionRates: {},
  promotionalDiscounts: {},
  withdrawalFeeType: 'flat',
  withdrawalFeeKes: 0,
  withdrawalFeeRate: 0,
  minimumPayoutKes: 100,
  minimumTrustScoreForPayout: 30,
};

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export async function getPaymentSettings(client) {
  const result = await client.query(`select value from platform_settings where key = 'global'`);
  const settings = result.rows[0]?.value || {};
  return { ...DEFAULT_PAYMENTS, ...(settings.payments || {}) };
}

export function calculateCommission({ amount, category, settings }) {
  const total = money(amount);
  const categoryRates = settings.categoryCommissionRates || {};
  const discounts = settings.promotionalDiscounts || {};
  const categoryRate = Number(categoryRates[category]);
  const baseRate = Number.isFinite(categoryRate) ? categoryRate : Number(settings.commissionRate);
  const discount = Math.max(0, Math.min(1, Number(discounts[category] || discounts.global || 0)));
  const effectiveRate = Math.max(0, baseRate * (1 - discount));
  const fixed = Math.max(0, Number(settings.fixedCommissionKes || 0));
  const type = settings.commissionType === 'fixed' ? 'fixed' : 'percentage';
  const platformCommission = money(type === 'fixed' ? Math.min(fixed, total) : total * effectiveRate);
  return {
    commissionType: type,
    commissionRate: money(effectiveRate),
    platformCommission,
    fundiAmount: money(total - platformCommission),
    details: {
      category,
      configuredRate: baseRate,
      promotionalDiscount: discount,
      fixedCommissionKes: fixed,
    },
  };
}

export function calculateWithdrawalFee(amount, settings) {
  const total = money(amount);
  const type = settings.withdrawalFeeType === 'percentage' ? 'percentage' : 'flat';
  const fee = type === 'percentage'
    ? money(total * Math.max(0, Number(settings.withdrawalFeeRate || 0)))
    : money(Math.max(0, Number(settings.withdrawalFeeKes || 0)));
  return {
    withdrawalFee: Math.min(fee, total),
    netAmount: money(total - Math.min(fee, total)),
    withdrawalFeeType: type,
  };
}
