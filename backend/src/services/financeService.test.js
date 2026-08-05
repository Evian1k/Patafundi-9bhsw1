import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCommission, calculateWithdrawalFee, getPaymentSettings } from './financeService.js';

const BASE_SETTINGS = {
  commissionRate: 0.15,
  commissionType: 'percentage',
  fixedCommissionKes: 0,
  categoryCommissionRates: {},
  promotionalDiscounts: {},
  withdrawalFeeType: 'flat',
  withdrawalFeeKes: 0,
  withdrawalFeeRate: 0,
};

test('getPaymentSettings merges stored payment settings over the defaults', async () => {
  const client = {
    query: async () => ({ rows: [{ value: { payments: { commissionRate: 0.2, minimumPayoutKes: 500 } } }] }),
  };
  const settings = await getPaymentSettings(client);
  assert.equal(settings.commissionRate, 0.2);
  assert.equal(settings.minimumPayoutKes, 500);
  assert.equal(settings.commissionType, 'percentage');
  assert.equal(settings.minimumTrustScoreForPayout, 30);
});

test('getPaymentSettings returns defaults when no settings row exists', async () => {
  const settings = await getPaymentSettings({ query: async () => ({ rows: [] }) });
  assert.equal(settings.commissionRate, 0.15);
  assert.equal(settings.minimumPayoutKes, 100);
});

test('calculateCommission applies the global percentage rate', () => {
  const result = calculateCommission({ amount: 1000, category: 'plumbing', settings: BASE_SETTINGS });
  assert.equal(result.commissionType, 'percentage');
  assert.equal(result.commissionRate, 0.15);
  assert.equal(result.platformCommission, 150);
  assert.equal(result.fundiAmount, 850);
  assert.equal(result.details.category, 'plumbing');
});

test('calculateCommission prefers a category specific rate', () => {
  const result = calculateCommission({
    amount: 1000,
    category: 'electrical',
    settings: { ...BASE_SETTINGS, categoryCommissionRates: { electrical: 0.1 } },
  });
  assert.equal(result.platformCommission, 100);
  assert.equal(result.fundiAmount, 900);
  assert.equal(result.details.configuredRate, 0.1);
});

test('calculateCommission applies category and global promotional discounts', () => {
  const categoryDiscount = calculateCommission({
    amount: 1000,
    category: 'plumbing',
    settings: { ...BASE_SETTINGS, promotionalDiscounts: { plumbing: 0.5, global: 0.1 } },
  });
  assert.equal(categoryDiscount.commissionRate, 0.08); // reported rate is rounded to 2dp
  assert.equal(categoryDiscount.platformCommission, 75);

  const globalDiscount = calculateCommission({
    amount: 1000,
    category: 'painting',
    settings: { ...BASE_SETTINGS, promotionalDiscounts: { global: 0.2 } },
  });
  assert.equal(globalDiscount.platformCommission, 120);
});

test('calculateCommission clamps discounts to the 0-1 range', () => {
  const overDiscount = calculateCommission({
    amount: 1000,
    category: 'plumbing',
    settings: { ...BASE_SETTINGS, promotionalDiscounts: { plumbing: 5 } },
  });
  assert.equal(overDiscount.platformCommission, 0);
  assert.equal(overDiscount.fundiAmount, 1000);

  const negativeDiscount = calculateCommission({
    amount: 1000,
    category: 'plumbing',
    settings: { ...BASE_SETTINGS, promotionalDiscounts: { plumbing: -3 } },
  });
  assert.equal(negativeDiscount.platformCommission, 150);
});

test('calculateCommission uses a fixed commission capped at the job amount', () => {
  const settings = { ...BASE_SETTINGS, commissionType: 'fixed', fixedCommissionKes: 200 };
  const normal = calculateCommission({ amount: 1000, category: 'plumbing', settings });
  assert.equal(normal.commissionType, 'fixed');
  assert.equal(normal.platformCommission, 200);
  assert.equal(normal.fundiAmount, 800);

  const capped = calculateCommission({ amount: 150, category: 'plumbing', settings });
  assert.equal(capped.platformCommission, 150);
  assert.equal(capped.fundiAmount, 0);
});

test('calculateCommission rounds money to two decimals', () => {
  const result = calculateCommission({
    amount: 333.333,
    category: 'plumbing',
    settings: { ...BASE_SETTINGS, commissionRate: 0.155 },
  });
  assert.equal(result.platformCommission, 51.67);
  assert.equal(result.fundiAmount, 281.66);
});

test('calculateCommission treats missing or invalid amounts as zero', () => {
  const result = calculateCommission({ amount: undefined, category: 'plumbing', settings: BASE_SETTINGS });
  assert.equal(result.platformCommission, 0);
  assert.equal(result.fundiAmount, 0);
});

test('calculateWithdrawalFee applies a flat fee by default', () => {
  const result = calculateWithdrawalFee(1000, { ...BASE_SETTINGS, withdrawalFeeKes: 50 });
  assert.equal(result.withdrawalFeeType, 'flat');
  assert.equal(result.withdrawalFee, 50);
  assert.equal(result.netAmount, 950);
});

test('calculateWithdrawalFee applies a percentage fee when configured', () => {
  const result = calculateWithdrawalFee(1000, {
    ...BASE_SETTINGS,
    withdrawalFeeType: 'percentage',
    withdrawalFeeRate: 0.02,
  });
  assert.equal(result.withdrawalFeeType, 'percentage');
  assert.equal(result.withdrawalFee, 20);
  assert.equal(result.netAmount, 980);
});

test('calculateWithdrawalFee never exceeds the withdrawal amount', () => {
  const result = calculateWithdrawalFee(30, { ...BASE_SETTINGS, withdrawalFeeKes: 50 });
  assert.equal(result.withdrawalFee, 30);
  assert.equal(result.netAmount, 0);
});

test('calculateWithdrawalFee ignores negative fee configuration', () => {
  const result = calculateWithdrawalFee(100, { ...BASE_SETTINGS, withdrawalFeeKes: -25 });
  assert.equal(result.withdrawalFee, 0);
  assert.equal(result.netAmount, 100);
});
