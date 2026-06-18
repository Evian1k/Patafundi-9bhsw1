/**
 * Demo mode data — realistic sample data shown when backend is unavailable.
 * Ensures users always see a working app experience.
 */

/** Only enabled when explicitly set — avoids fake demo job IDs hitting the real API. */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export const demoJobs = [
  {
    id: 'demo-job-1',
    title: 'Leaking kitchen pipe',
    description: 'Kitchen sink pipe is leaking badly, water everywhere.',
    category: 'plumbing',
    location: 'Westlands, Nairobi',
    status: 'in_progress',
    createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    updatedAt: new Date().toISOString(),
    urgency: 'asap',
  },
  {
    id: 'demo-job-2',
    title: 'Electrical short circuit',
    description: 'Power keeps tripping in the living room.',
    category: 'electrical',
    location: 'Karen, Nairobi',
    status: 'completed',
    createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 3600_000).toISOString(),
    urgency: 'today',
  },
  {
    id: 'demo-job-3',
    title: 'AC servicing needed',
    description: 'Split unit AC not cooling properly.',
    category: 'hvac',
    location: 'Kilimani, Nairobi',
    status: 'pending',
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    urgency: 'scheduled',
  },
];

export const demoUser = {
  id: 'demo-user-1',
  email: 'demo@example.com',
  fullName: 'Demo Customer',
  role: 'customer',
  phone: '+254700000001',
};

export const demoFundi = {
  id: 'demo-fundi-1',
  firstName: 'James',
  lastName: 'Kamau',
  skills: ['Plumbing', 'General Repair'],
  rating: 4.8,
  reviewCount: 47,
  location: 'Nairobi CBD',
  experienceYears: 5,
};

export const demoDashboardStats = {
  totalUsers: 2847,
  totalFundis: 384,
  pendingVerifications: 12,
  approvedFundis: 341,
  rejectedFundis: 28,
  suspendedFundis: 3,
  activeJobs: 89,
  completedJobs: 4210,
  totalRevenue: 3_842_500,
  escrowPending: 23,
  bypassAlerts: 4,
};

export const demoWalletData = {
  balance: 12_500,
  escrowPending: 4_800,
  totalEarnings: 87_350,
  transactions: [
    { id: 't1', type: 'credit', amount: 2400, description: 'Payout — Plumbing job', date: new Date(Date.now() - 1 * 86400_000).toISOString(), status: 'completed' },
    { id: 't2', type: 'credit', amount: 3600, description: 'Payout — Electrical job', date: new Date(Date.now() - 2 * 86400_000).toISOString(), status: 'completed' },
    { id: 't3', type: 'credit', amount: 1800, description: 'Payout — AC service', date: new Date(Date.now() - 4 * 86400_000).toISOString(), status: 'completed' },
    { id: 't4', type: 'escrow', amount: 4800, description: 'Escrow hold — Carpentry job', date: new Date(Date.now() - 6 * 3600_000).toISOString(), status: 'pending' },
    { id: 't5', type: 'debit', amount: 500, description: 'Subscription fee — Monthly', date: new Date(Date.now() - 7 * 86400_000).toISOString(), status: 'completed' },
  ],
};
