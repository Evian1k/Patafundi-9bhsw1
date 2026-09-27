import { getEmbeddedDb } from '../backend/src/pglite-instance.js';

const db = await getEmbeddedDb();
const res = await db.query(
  `select u.email, f.rating, f.latitude, f.longitude, f.verification_badge,
          (select count(*)::int from jobs j where j.fundi_id = f.user_id and j.status = 'completed') as completed,
          (select count(*)::int from jobs j where j.fundi_id = f.user_id) as total,
          coalesce(qs.overall_score, 0) as quality
     from fundis f join users u on u.id = f.user_id
     left join fundi_quality_scores qs on qs.fundi_id = f.user_id
    where f.approval_status = 'approved' and f.online = true and f.latitude is not null
    order by f.rating desc nulls last`
);
console.log(JSON.stringify(res.rows, null, 1));
process.exit(0);
