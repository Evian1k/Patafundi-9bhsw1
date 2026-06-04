import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json, err } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

function admin() { return createClient(supabaseUrl, serviceKey); }
function anon() { return createClient(supabaseUrl, anonKey); }

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/auth/, '');
  const db = admin();

  try {
    // ── POST /auth/register ────────────────────────────────────────────────
    if (path === '/register' && req.method === 'POST') {
      const { email, password, fullName, phone, role = 'customer' } = await req.json();
      if (!email || !password || !fullName) return err('email, password, and fullName are required');
      if (password.length < 6) return err('Password must be at least 6 characters');

      // Create user in Supabase Auth
      const { data: authData, error: authErr } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm for faster onboarding; OTP used as secondary verification
        user_metadata: { full_name: fullName, role },
      });

      if (authErr) {
        const msg = authErr.message.toLowerCase();
        if (msg.includes('already') || msg.includes('exists')) {
          return err('An account with this email already exists', 409);
        }
        return err(authErr.message, 400);
      }

      const userId = authData.user.id;

      // Create profile
      await db.from('user_profiles').upsert({
        id: userId,
        email,
        full_name: fullName,
        username: email.split('@')[0] + '_' + Math.floor(Math.random() * 1000),
        phone: phone || null,
        role,
        trust_score: 75,
      });

      // Generate OTP for email verification
      const { data: otpCode } = await db.rpc('generate_otp_for_email', {
        p_email: email,
        p_purpose: 'register',
      });

      console.log(`[auth/register] ✉️ OTP for ${email}: ${otpCode}`);

      // In production, send via email. For demo, return in response meta (dev only).
      return json({
        message: `Account created! Enter the OTP sent to ${email} to verify.`,
        email,
        // Dev only - remove in production:
        _devOtp: Deno.env.get('ENVIRONMENT') === 'production' ? undefined : otpCode,
      }, 201);
    }

    // ── POST /auth/otp-verify ──────────────────────────────────────────────
    if (path === '/otp-verify' && req.method === 'POST') {
      const { email, code, purpose = 'register' } = await req.json();
      if (!email || !code) return err('email and code are required');

      // Verify OTP
      const { data: isValid } = await db.rpc('verify_otp', {
        p_email: email,
        p_code: String(code),
        p_purpose: purpose,
      });

      if (!isValid) return err('Invalid or expired OTP. Request a new one.', 401);

      // Get profile
      const { data: profile, error: profileErr } = await db
        .from('user_profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (profileErr || !profile) return err('Account not found', 404);

      // Sign in to get a real JWT
      // Since auth users are created with known passwords, use admin token trick
      const { data: sessionData, error: sessionErr } = await db.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });

      const token = sessionData?.properties?.access_token || '';

      return json({
        token,
        user: {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          username: profile.username,
          role: profile.role,
          phone: profile.phone,
          trustScore: profile.trust_score,
        },
        message: 'Email verified successfully',
      });
    }

    // ── POST /auth/otp-resend ──────────────────────────────────────────────
    if (path === '/otp-resend' && req.method === 'POST') {
      const { email, purpose = 'register' } = await req.json();
      if (!email) return err('email is required');

      const { data: otpCode } = await db.rpc('generate_otp_for_email', {
        p_email: email,
        p_purpose: purpose,
      });

      console.log(`[auth/otp-resend] New OTP for ${email}: ${otpCode}`);

      return json({
        message: 'A new OTP has been sent to your email.',
        _devOtp: Deno.env.get('ENVIRONMENT') === 'production' ? undefined : otpCode,
      });
    }

    // ── POST /auth/login ───────────────────────────────────────────────────
    if (path === '/login' && req.method === 'POST') {
      const { email, password } = await req.json();
      if (!email || !password) return err('email and password are required');

      const anonClient = anon();
      const { data, error } = await anonClient.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message.includes('Invalid login')) return err('Invalid email or password', 401);
        return err(error.message, 401);
      }

      if (!data.session) return err('Login failed — no session created', 500);

      // Get profile
      const { data: profile } = await db
        .from('user_profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      return json({
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          fullName: profile?.full_name || data.user.user_metadata?.full_name || '',
          username: profile?.username,
          role: profile?.role || data.user.user_metadata?.role || 'customer',
          phone: profile?.phone,
          trustScore: profile?.trust_score,
        },
      });
    }

    // ── POST /auth/logout ──────────────────────────────────────────────────
    if (path === '/logout' && req.method === 'POST') {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '');
      if (token) {
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        await userClient.auth.signOut().catch(() => {});
      }
      return json({ message: 'Logged out successfully' });
    }

    return err('Not found', 404);
  } catch (e) {
    console.error('[auth] Error:', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
