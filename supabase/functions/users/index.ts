import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json, err } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function admin() { return createClient(supabaseUrl, serviceKey); }

async function getUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = admin();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/users/, '');
  const db = admin();

  try {
    const authUser = await getUser(req);
    if (!authUser) return err('Unauthorized', 401);

    // GET /users/me
    if (path === '/me' && req.method === 'GET') {
      const { data: profile } = await db.from('user_profiles').select('*').eq('id', authUser.id).maybeSingle();
      if (!profile) return err('Profile not found', 404);
      return json({
        user: {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          username: profile.username,
          role: profile.role,
          phone: profile.phone,
          avatarUrl: profile.avatar_url,
          trustScore: profile.trust_score,
          isActive: profile.is_active,
          createdAt: profile.created_at,
        },
      });
    }

    // PUT /users/me
    if (path === '/me' && req.method === 'PUT') {
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.fullName !== undefined) updates.full_name = body.fullName;
      if (body.phone !== undefined) updates.phone = body.phone;
      if (body.username !== undefined) updates.username = body.username;

      const { data, error } = await db.from('user_profiles').update(updates).eq('id', authUser.id).select().maybeSingle();
      if (error) return err(error.message, 400);
      return json({ user: data, message: 'Profile updated' });
    }

    // GET /users/settings
    if (path === '/settings' && req.method === 'GET') {
      const { data: profile } = await db.from('user_profiles').select('*').eq('id', authUser.id).maybeSingle();
      return json({
        settings: {
          notifications: true,
          language: 'en',
          currency: 'KES',
          darkMode: false,
          profile: {
            fullName: profile?.full_name,
            email: profile?.email,
            phone: profile?.phone,
          },
        },
      });
    }

    // PUT /users/settings
    if (path === '/settings' && req.method === 'PUT') {
      return json({ message: 'Settings updated' });
    }

    // GET /users/saved-places
    if (path === '/saved-places' && req.method === 'GET') {
      return json({ places: [] });
    }

    // POST /users/change-password
    if (path === '/change-password' && req.method === 'POST') {
      const { newPassword } = await req.json();
      if (!newPassword || newPassword.length < 6) return err('Password must be at least 6 characters');
      const { error } = await db.auth.admin.updateUserById(authUser.id, { password: newPassword });
      if (error) return err(error.message, 400);
      return json({ message: 'Password changed successfully' });
    }

    // POST /users/delete-account
    if (path === '/delete-account' && req.method === 'POST') {
      await db.auth.admin.deleteUser(authUser.id);
      return json({ message: 'Account deleted' });
    }

    return err('Route not found', 404);
  } catch (e) {
    console.error('[users]', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
