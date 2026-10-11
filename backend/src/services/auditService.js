import { query } from '../db.js';

export async function auditLog({ client = null, userId = null, action, entityType = null, entityId = null, metadata = {} }) {
  const execute = client?.query ? client.query.bind(client) : query;
  await execute(
    `insert into audit_logs (user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5)`,
    [userId, action, entityType, entityId, JSON.stringify(metadata)],
  );
}
