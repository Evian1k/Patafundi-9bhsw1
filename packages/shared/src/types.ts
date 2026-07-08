export type UserRole = 'customer' | 'fundi' | 'admin' | 'staff';
export type UserStatus = 'active' | 'pending' | 'suspended' | 'banned';
export interface User { id: string; email: string; fullName: string; phone: string | null; role: UserRole; status: UserStatus; trustScore: number; avatarUrl?: string | null; createdAt?: string; }
export type JobStatus = 'matching' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'failed' | 'disputed';
export type Urgency = 'normal' | 'emergency';
export interface Job { id: string; customerId: string; fundiId: string | null; serviceCategory: string; description: string; estimatedPrice: number | null; finalPrice: number | null; status: JobStatus; urgency: Urgency; customerLatitude: number | null; customerLongitude: number | null; customerAddress: string | null; fundiName?: string | null; customerName?: string | null; customer_completion_confirmed?: boolean; hasReview?: boolean; createdAt: string; acceptedAt?: string | null; completedAt?: string | null; }
export interface JobLocation { jobId: string; latitude: number; longitude: number; accuracy?: number; recordedAt: string; }
export interface Message { id: string; jobId: string; senderId: string; senderName?: string; text: string; type: 'text' | 'image' | 'system'; readAt?: string | null; createdAt: string; }
export interface SavedPlace { id: string; label: string; address: string; latitude: number; longitude: number; }
export interface Notification { id: string; userId: string; title: string; message: string; body?: string; type: string; isRead: boolean; createdAt: string; }
export interface Payment { id: string; jobId: string; amount: number; status: 'pending' | 'processing' | 'completed' | 'failed'; method: 'mpesa' | 'card' | 'wallet'; phoneNumber?: string; mpesaRef?: string; createdAt: string; }
export interface WalletBalance { available: number; pending: number; currency: string; }
export interface WalletTransaction { id: string; type: 'credit' | 'debit' | 'payout' | 'commission' | 'refund'; amount: number; description: string; status: 'pending' | 'completed' | 'failed'; createdAt: string; }
export interface PayoutRequest { id: string; amount: number; status: 'pending' | 'processing' | 'completed' | 'failed'; method: string; createdAt: string; }
export interface Dispute { id: string; jobId: string; raisedBy: string; reason: string; description: string; status: 'open' | 'investigating' | 'resolved' | 'dismissed'; resolution?: string | null; createdAt: string; }
export interface Review { id: string; jobId: string; reviewerId: string; revieweeId: string; rating: number; comment: string; createdAt: string; }
export interface Referral { code: string; shareLink?: string; stats: { signups: number; completedJobs: number; vouchersEarned: number; pendingRewards: number; }; rewards: Array<{ id: string; type: string; value: number; status: string; createdAt: string; }>; }
export interface Loyalty { tier: 'bronze' | 'silver' | 'gold' | 'platinum'; points: number; pointsToNextTier: number; perks: string[]; history: Array<{ id: string; points: number; reason: string; createdAt: string; }>; }
export interface FundiDashboard { online: boolean; activeJobs: number; completedJobs: number; rating: number; earningsToday: number; earningsWeek: number; earningsMonth: number; acceptanceRate?: number; }
export interface FundiPublic { id: string; fullName: string; serviceCategory: string; rating: number; reviewCount: number; completedJobs: number; trustScore: number; avatarUrl?: string | null; bio?: string | null; verified: boolean; }
export interface GeoFindFundisResult { fundis: Array<{ fundiId: string; fullName: string; serviceCategory: string; rating: number; distanceKm: number; etaMinutes: number; surgeMultiplier: number; estimatedPrice: number; avatarUrl?: string | null; }>; surgeZone?: boolean; searchedAt: string; }
export interface SurgePricingResult { basePrice: number; surgeMultiplier: number; finalPrice: number; breakdown: { distance: number; time: number; surge: number; serviceFee: number; }; }
export interface AuthResponse { success: boolean; token?: string; refreshToken?: string; user?: User; devOtp?: string; requires2FA?: boolean; message?: string; }
export interface ApiError extends Error { status?: number; maintenanceMode?: boolean; code?: string; }


// ── Pricing Engine ────────────────────────────────────────────
export interface PriceBreakdown {
  serviceCost: number;
  travelFee: number;
  emergencyFee: number;
  timeMultiplier: number;
  weatherMultiplier: number;
  surgeMultiplier: number;
  platformFee: number;
  estimatedDurationMinutes: number;
  etaMinutes: number;
  total: number;
  commissionPercent: number;
  commissionAmount: number;
  fundiEarnings: number;
  distanceKm: number;
  factors: {
    complexity: 'simple' | 'medium' | 'complex' | 'expert';
    countyAdjustment: number;
    timeReasons: string[];
    weatherReason: string | null;
    demandMultiplier: number;
    eventMultiplier: number;
    isEmergency: boolean;
    isImmediate: boolean;
  };
}
