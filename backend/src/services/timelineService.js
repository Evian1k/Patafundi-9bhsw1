import { query } from '../db.js';

const EVENT_MAP = {
  matching: 'job_posted',
  accepted: 'fundi_accepted',
  arrived: 'fundi_arrived',
  in_progress: 'work_started',
  completed: 'work_completed',
  cancelled: 'job_cancelled',
};

export async function recordTimelineEvent({
  jobId,
  eventType,
  actorId = null,
  actorRole = null,
  metadata = {},
}) {
  if (!jobId || !eventType) return;
  await query(
    `insert into job_timeline (job_id, event_type, actor_id, actor_role, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [jobId, eventType, actorId, actorRole, JSON.stringify(metadata)],
  );
}

export async function recordJobStatusTimeline(job, status, actorId, actorRole) {
  const eventType = EVENT_MAP[status];
  if (eventType) {
    await recordTimelineEvent({ jobId: job.id, eventType, actorId, actorRole, metadata: { status } });
  }
}

export async function getJobTimeline(jobId) {
  const result = await query(
    `select jt.*, u.full_name as actor_name
     from job_timeline jt
     left join users u on u.id = jt.actor_id
     where jt.job_id = $1
     order by jt.created_at asc`,
    [jobId],
  );
  return result.rows;
}
