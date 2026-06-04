import { query } from '../db.js';

export async function auditLog({ userId = null, action, entityType = null, entityId = null, metadata = {} }) {
  await query(
    `insert into audit_logs (user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5)`,
    [userId, action, entityType, entityId, JSON.stringify(metadata)],
  );
}
