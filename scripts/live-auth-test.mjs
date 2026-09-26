import fetch from 'node-fetch';

const BASE = 'http://127.0.0.1:4000/api';
const email = `live-test-${Date.now()}@test.patafundi.com`;
const password = 'LiveTest@2026!';

async function main() {
  console.log('register', email);
  const registerRes = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName: 'Live Test User', phone: '254712345678' }),
  });
  const registerBody = await registerRes.text();
  console.log('register status', registerRes.status);
  console.log('register body', registerBody);

  console.log('login');
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.text();
  console.log('login status', loginRes.status);
  console.log('login body', loginBody);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});