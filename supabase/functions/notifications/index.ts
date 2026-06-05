import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, json, err } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function admin() { return createClient(supabaseUrl, serviceKey); }

async function getAuthUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await admin().auth.getUser(token);
  return user || null;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const fullPath = url.pathname.replace(/^\/functions\/v1\/notifications/, '');
  const db = admin();

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return err('Unauthorized', 401);

    // GET /notifications
    if (fullPath === '' && req.method === 'GET') {
      const { data: notifications } = await db.from('notifications')
        .select('*')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false })
        .limit(30);
      const unreadCount = (notifications || []).filter((n) => !n.read).length;
      return json({ notifications: notifications || [], unreadCount });
    }

    // PATCH /notifications/:id/read
    const readMatch = fullPath.match(/^\/([a-f0-9-]{36})\/read$/);
    if (readMatch && req.method === 'PATCH') {
      await db.from('notifications').update({ read: true }).eq('id', readMatch[1]).eq('user_id', authUser.id);
      return json({ message: 'Marked as read' });
    }

    // PATCH /notifications/read-all
    if (fullPath === '/read-all' && req.method === 'PATCH') {
      await db.from('notifications').update({ read: true }).eq('user_id', authUser.id).eq('read', false);
      return json({ message: 'All notifications marked as read' });
    }

    return err('Route not found', 404);
  } catch (e) {
    console.error('[notifications]', e);
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
});
