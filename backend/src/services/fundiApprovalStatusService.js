export function buildFundiApprovalStatus(record) {
  const fundi = record || { approval_status: 'not_registered', rejection_reason: null };
  const status = fundi.approval_status || 'not_registered';
  const message = status === 'approved'
    ? 'Approved — you can go online and accept jobs.'
    : status === 'rejected'
      ? fundi.rejection_reason || 'Your application was not approved. Please contact support.'
      : status === 'not_registered'
        ? 'No Fundi application is associated with this account.'
        : 'Your application is under review.';

  return { status, message, fundi };
}
