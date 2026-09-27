// Debug: replicate fundi registration to surface the failing INSERT stack.
import { createFundiRegistration } from '../backend/src/services/fundiRegistrationService.js';

const fakePng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050201f34a24d50000000049454e44ae426082',
  'hex',
);

const body = {
  email: `debug-fundi-${Date.now()}@test.local`,
  password: 'Fundi@2024',
  fullName: 'Debug Fundi',
  phone: '254700999888',
  skills: JSON.stringify(['plumbing']),
  idNumber: '87654321',
};

const files = [
  { fieldname: 'idPhoto', originalname: 'id.png', mimetype: 'image/png', size: fakePng.length, buffer: fakePng },
  { fieldname: 'idPhotoBack', originalname: 'idb.png', mimetype: 'image/png', size: fakePng.length, buffer: fakePng },
  { fieldname: 'selfiePhoto', originalname: 'selfie.png', mimetype: 'image/png', size: fakePng.length, buffer: fakePng },
];

try {
  const result = await createFundiRegistration({ body, files });
  console.log('REGISTER OK:', result.user.email, 'fundi:', result.fundi.id);
} catch (error) {
  console.error('REGISTER FAILED:', error.message);
  console.error('STACK:', error.stack?.split('\n').slice(0, 12).join('\n'));
  if (error.detail) console.error('DETAIL:', error.detail);
}
process.exit(0);
