import 'dotenv/config';

const password = process.env.PATAFUNDI_DEMO_SEED_PASSWORD;

if (!password) {
  throw new Error('PATAFUNDI_DEMO_SEED_PASSWORD is required for demo-account scripts');
}
if (process.env.VERIFY_ALLOW_MUTATIONS !== 'true') {
  throw new Error('Set VERIFY_ALLOW_MUTATIONS=true only when running against isolated test data');
}

const apiTarget = process.env.VERIFY_API_URL
  || process.env.API_URL
  || process.env.PATAFUNDI_E2E_BASE
  || process.env.PATAFUNDI_BATTERY_BASE
  || process.env.PF_BASE
  || 'http://127.0.0.1:4000';
const target = new URL(apiTarget);
if (['patafundi-9bhsw1.onrender.com', 'patafundi-9bhsw1.vercel.app'].includes(target.hostname)) {
  throw new Error('Demo-account scripts refuse the known production hostnames');
}
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)
  && process.env.VERIFY_ALLOW_REMOTE_MUTATIONS !== 'true') {
  throw new Error('Remote test APIs require VERIFY_ALLOW_REMOTE_MUTATIONS=true');
}

export function getDemoPassword() {
  return password;
}
