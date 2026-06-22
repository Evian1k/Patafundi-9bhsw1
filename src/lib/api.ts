/**
 * API Client for PataFundi — Node.js Express Backend
 * All routes map to /api/* on the PataFundi backend.
 */

import { buildApiUrl, isApiConfigured } from '@/api/config';
import { clearAuthSession, setAuthSession } from '@/lib/authSession';

export class ApiError extends Error {
  status: number;
  meta?: unknown;
  constructor(message: string, status = 0, meta?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.meta = meta;
  }
}

const UNAVAILABLE_MSG = 'Service temporarily unavailable. Please try again.';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

class ApiClient {
  token: string | null;

  constructor() {
    this.token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem('auth_token', token);
      else localStorage.removeItem('auth_token');
    }
    if (!token) clearAuthSession();
  }

  private syncTokenFromStorage(): string | null {
    if (typeof localStorage !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private getHeaders(includeAuth = true): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.syncTokenFromStorage();
    if (includeAuth && token) h['Authorization'] = `Bearer ${token}`;
    const csrf = readCookie('csrf_token');
    if (csrf) h['X-CSRF-Token'] = csrf;
    return h;
  }

  async request(
    endpoint: string,
    options: RequestInit & { includeAuth?: boolean } = {},
    retries = 1,
  ): Promise<unknown> {
    if (!isApiConfigured()) throw new ApiError(UNAVAILABLE_MSG, 0);

    const { includeAuth = true, ...fetchOpts } = options;
    const url = buildApiUrl(endpoint);

    const config: RequestInit = {
      ...fetchOpts,
      credentials: 'include',
      headers: {
        ...this.getHeaders(includeAuth),
        ...(fetchOpts.headers as Record<string, string> ?? {}),
      },
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }
    // Remove Content-Type for FormData (browser sets it with boundary)
    if (config.body instanceof FormData) {
      delete (config.headers as Record<string, string>)['Content-Type'];
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      let response: Response;
      try {
        const controller = new AbortController();
        const tId = setTimeout(() => controller.abort(), 30_000);
        response = await fetch(url, { ...config, signal: controller.signal });
        clearTimeout(tId);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
          if (attempt < retries) { await sleep(1000); continue; }
          throw new ApiError('Request timed out. Please check your connection.', 0);
        }
        if (attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
        throw new ApiError('Unable to connect. Please check your internet connection.', 0);
      }

      if (response.status >= 500 && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      if (response.status === 401 && this.token && attempt === 0) {
        // JWT expired — try to refresh once, then retry the original request
        try {
          const refreshed = await this.refreshToken();
          if (refreshed) {
            config.headers = config.headers || {};
            (config.headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
            continue; // retry with new token
          }
        } catch {
          // refresh failed — clear token, redirect to login
          this.setToken(null);
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/auth')) {
            window.location.href = '/auth';
          }
        }
      }

      // 403 = Forbidden (permission denied) — do NOT retry, just throw.
      // Refreshing the token won't help because the user's role/permissions
      // haven't changed. Let the caller handle the 403 gracefully.

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText })) as { message?: string; maintenanceMode?: boolean };
        const err = new ApiError(errorBody?.message || response.statusText || 'Request failed', response.status);
        // Attach maintenance flag so the frontend can show a maintenance page
        // instead of a generic error. Backend returns maintenanceMode: true
        // when the maintenance_mode feature flag is enabled.
        (err as any).maintenanceMode = errorBody?.maintenanceMode === true;
        throw err;
      }

      return response.json();
    }

    throw new ApiError(UNAVAILABLE_MSG, 0);
  }

  // ── Token refresh ─────────────────────────────────────────────────────
  /** Attempts to refresh the JWT access token using the httpOnly refresh cookie. */
  async refreshToken(): Promise<boolean> {
    try {
      const url = buildApiUrl('/auth/refresh');
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (data?.token) {
        this.setToken(data.token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  async register(email: string, password: string, fullName: string, phone: string | null = null, role = 'customer') {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, phone, role }),
      includeAuth: false,
    });
  }

  async registerFundiAccount(formData: FormData) {
    if (!isApiConfigured()) throw new ApiError(UNAVAILABLE_MSG, 0);
    const url = buildApiUrl('/auth/register/fundi');
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new ApiError(e.message || 'Fundi registration failed', response.status);
    }
    return response.json() as Promise<{ success: boolean; email: string; otpRequired: boolean; devOtp?: string }>;
  }

  async getFundiOnboardingStatus() {
    return this.request('/fundi/onboarding-status');
  }

  async otpVerify(email: string, code: string, purpose = 'register') {
    const data = await this.request('/auth/otp-verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, purpose }),
      includeAuth: false,
    }) as { token?: string };
    if (data?.token) {
      this.setToken(data.token);
      const user = (data as { user?: Record<string, unknown> }).user;
      if (user?.id) setAuthSession(String(user.id), String(user.role || 'customer'));
    }
    return data;
  }

  async otpResend(email: string, purpose = 'register') {
    return this.request('/auth/otp-resend', {
      method: 'POST',
      body: JSON.stringify({ email, purpose }),
      includeAuth: false,
    });
  }

  async login(email: string, password: string) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      includeAuth: false,
    }) as { token?: string };
    if (data?.token) {
      this.setToken(data.token);
      const user = (data as { user?: Record<string, unknown> }).user;
      if (user?.id) setAuthSession(String(user.id), String(user.role || 'customer'));
    }
    return data;
  }

  async logout() {
    try { await this.request('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    finally { this.setToken(null); }
  }

  async forgotPassword(email: string) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      includeAuth: false,
    });
  }

  async resetPassword(email: string, code: string, password: string) {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, password }),
      includeAuth: false,
    });
  }

  async getCurrentUser(): Promise<{ user: Record<string, unknown> }> {
    return this.request('/users/me') as Promise<{ user: Record<string, unknown> }>;
  }

  // ── User / Settings ──────────────────────────────────────────────────────
  async updateMe(payload: { fullName?: string | null; phone?: string | null } = {}) {
    return this.request('/users/me', { method: 'PUT', body: JSON.stringify(payload) });
  }

  async getUserSettings() { return this.request('/users/settings'); }

  async updateUserSettings(payload: Record<string, unknown>) {
    return this.request('/users/settings', { method: 'PUT', body: JSON.stringify(payload) });
  }

  async getSavedPlaces() { return this.request('/users/saved-places'); }

  async addSavedPlace(payload: Record<string, unknown>) {
    return this.request('/users/saved-places', { method: 'POST', body: JSON.stringify(payload) });
  }

  async updateSavedPlace(id: string, payload: Record<string, unknown>) {
    return this.request(`/users/saved-places/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  async deleteSavedPlace(id: string) {
    return this.request(`/users/saved-places/${id}`, { method: 'DELETE' });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request('/users/change-password', {
      method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async deleteAccount(password: string) {
    return this.request('/users/delete-account', { method: 'POST', body: JSON.stringify({ password }) });
  }

  // ── Fundi ────────────────────────────────────────────────────────────────
  async submitFundiRegistration(formData: FormData) {
    if (!isApiConfigured()) throw new ApiError(UNAVAILABLE_MSG, 0);
    const url = buildApiUrl('/fundi/register');
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${this.token ?? ''}`,
        ...(readCookie('csrf_token') ? { 'X-CSRF-Token': readCookie('csrf_token') as string } : {}),
      },
      body: formData,
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new Error(e.message || 'Registration failed');
    }
    return response.json();
  }

  async getJobPhotos(jobId: string) {
    return this.request(`/jobs/${jobId}/photos`);
  }

  async getAdminVerificationDocuments(fundiId: string) {
    return this.request(`/admin/verification-documents/${fundiId}`);
  }

  async startLivenessSession() {
    return this.request('/verification/liveness/start', { method: 'POST' }) as Promise<{
      sessionId: string;
      challenges: { id: string; label: string; durationMs: number }[];
    }>;
  }

  async submitLivenessFrame(sessionId: string, challengeId: string, frame: Blob, clientConfidence = 0.85) {
    if (!isApiConfigured()) throw new ApiError(UNAVAILABLE_MSG, 0);
    const fd = new FormData();
    fd.append('challengeId', challengeId);
    fd.append('clientConfidence', String(clientConfidence));
    fd.append('frame', frame, 'frame.jpg');
    const url = buildApiUrl(`/verification/liveness/${sessionId}/frame`);
    const csrf = readCookie('csrf_token');
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${this.token ?? ''}`,
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: fd,
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new ApiError(e.message || 'Frame upload failed', response.status);
    }
    return response.json();
  }

  async completeLivenessSession(sessionId: string) {
    return this.request(`/verification/liveness/${sessionId}/complete`, { method: 'POST' }) as Promise<{
      livenessScore: number;
      faceMatchScore: number;
      fraudRiskScore: number;
      verificationResult: string;
      autoApproved?: boolean;
    }>;
  }

  async getVerificationStatus() {
    return this.request('/verification/status');
  }

  async requestFundiReupload(fundiId: string, reason: string) {
    return this.request(`/admin/fundis/${fundiId}/request-reupload`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async uploadJobPhoto(jobId: string, formData: FormData) {
    if (!isApiConfigured()) throw new ApiError(UNAVAILABLE_MSG, 0);
    const url = buildApiUrl(`/jobs/${jobId}/photos`);
    const csrf = readCookie('csrf_token');
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${this.token ?? ''}`,
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: formData,
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new ApiError(e.message || 'Photo upload failed', response.status);
    }
    return response.json();
  }

  async getFundiProfile() { return this.request('/fundi/profile'); }
  async getFundiApprovalStatus() { return this.request('/fundi/approval-status'); }
  async updateFundiProfile(data: Record<string, unknown>) {
    return this.request('/fundi/profile', { method: 'PUT', body: JSON.stringify(data) });
  }

  async getFundi(fundiId: string) { return this.request(`/fundi/${fundiId}`, { includeAuth: false }); }

  async searchFundis(latitude: number, longitude: number, skill: string | null = null) {
    let endpoint = `/fundi/search?latitude=${latitude}&longitude=${longitude}`;
    if (skill) endpoint += `&skill=${encodeURIComponent(skill)}`;
    return this.request(endpoint, { includeAuth: false });
  }

  async getFundiDashboard() { return this.request('/fundi/dashboard'); }
  async getFundiStatus() { return this.request('/fundi/status'); }

  async getFundiWalletBalance() { return this.request('/payments/wallet/balance'); }

  async getFundiWalletTransactions(limit = 20, offset = 0) {
    return this.request(`/fundi/wallet/transactions?limit=${limit}&offset=${offset}`);
  }

  async submitWithdrawalRequest(amount: number, mpesaNumber: string) {
    return this.request('/payouts/request', {
      method: 'POST', body: JSON.stringify({ amount, mpesaNumber }),
    });
  }

  async getFundiRatings(limit = 10, offset = 0) {
    return this.request(`/fundi/ratings?limit=${limit}&offset=${offset}`);
  }

  async goOnline(latitude: number, longitude: number, accuracy?: number) {
    return this.request('/fundi/status/online', {
      method: 'POST', body: JSON.stringify({ latitude, longitude, accuracy }),
    });
  }

  async goOffline() { return this.request('/fundi/status/offline', { method: 'POST' }); }

  async updateLocation(latitude: number, longitude: number, accuracy?: number, jobId?: string) {
    return this.request('/fundi/location', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude, accuracy, jobId }),
    });
  }

  async activateSubscription(plan: string) {
    return this.request('/subscriptions/activate', { method: 'POST', body: JSON.stringify({ plan }) });
  }

  // ── Jobs ─────────────────────────────────────────────────────────────────
  async createJob(jobData: Record<string, unknown>) {
    return this.request('/jobs', { method: 'POST', body: JSON.stringify(jobData) });
  }

  async getUserJobs() { return this.request('/jobs'); }
  async getJob(jobId: string) { return this.request(`/jobs/${jobId}`); }
  async getJobStatus(jobId: string) { return this.request(`/jobs/${jobId}/status`); }
  async getJobLocation(jobId: string) { return this.request(`/jobs/${jobId}/location`); }
  async getFundiActiveJob() { return this.request('/jobs/fundi/active'); }

  async cancelJob(jobId: string, reason: string | null = null) {
    return this.request(`/jobs/${jobId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  async updateJobStatus(jobId: string, status: string) {
    return this.request(`/jobs/${jobId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  async acceptJob(jobId: string, estimatedPrice: number | null = null) {
    return this.request(`/jobs/${jobId}/accept`, {
      method: 'POST', body: JSON.stringify({ estimatedPrice }),
    });
  }

  async checkInToJob(jobId: string, latitude: number, longitude: number, status = 'on_the_way') {
    return this.request(`/jobs/${jobId}/check-in`, {
      method: 'POST', body: JSON.stringify({ latitude, longitude, status }),
    });
  }

  async completeJob(jobId: string, finalPrice: string | number, photos: File[] = []) {
    if (!isApiConfigured()) throw new ApiError(UNAVAILABLE_MSG, 0);
    const formData = new FormData();
    formData.append('finalPrice', String(finalPrice));
    photos.forEach((photo) => formData.append('photos', photo));
    const url = buildApiUrl(`/jobs/${jobId}/complete`);
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${this.token ?? ''}`,
        ...(readCookie('csrf_token') ? { 'X-CSRF-Token': readCookie('csrf_token') as string } : {}),
      },
      body: formData,
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new Error(e.message || 'Job completion failed');
    }
    return response.json();
  }

  async confirmJobCompletion(jobId: string, otp: string) {
    return this.request(`/jobs/${jobId}/confirm-completion`, {
      method: 'POST', body: JSON.stringify({ otp }),
    });
  }

  async submitReview(jobId: string, rating: number, comment: string) {
    return this.request('/reviews', {
      method: 'POST', body: JSON.stringify({ jobId, rating, comment }),
    });
  }

  async getReviewsForFundi(fundiId: string, limit = 10, offset = 0) {
    return this.request(`/fundi/${fundiId}/reviews?limit=${limit}&offset=${offset}`, { includeAuth: false });
  }

  // ── Payments ─────────────────────────────────────────────────────────────
  async getPaymentForJob(jobId: string) { return this.request(`/payments/job/${jobId}`); }

  async processPayment(jobId: string, mpesaNumber: string, paymentMethod = 'mpesa') {
    return this.request('/payments/stk-push', {
      method: 'POST', body: JSON.stringify({ jobId, mpesaNumber, paymentMethod }),
    });
  }

  async getEscrowStatus(jobId: string) { return this.request(`/payments/escrow/${jobId}`); }

  // ── Disputes ─────────────────────────────────────────────────────────────
  async openDispute(jobId: string, reason: string, evidenceUrls: string[] = []) {
    return this.request('/disputes', {
      method: 'POST', body: JSON.stringify({ jobId, reason, evidenceUrls }),
    });
  }

  async getDisputes(status?: string) {
    const qs = status ? `?status=${status}` : '';
    return this.request(`/disputes${qs}`);
  }

  async getAdminDisputes(page = 1, status?: string) {
    let endpoint = `/admin/disputes?page=${page}`;
    if (status) endpoint += `&status=${status}`;
    return this.request(endpoint);
  }

  async resolveDispute(disputeId: string, resolution: string, refundAmount?: number) {
    return this.request(`/admin/disputes/${disputeId}/resolve`, {
      method: 'POST', body: JSON.stringify({ resolution, refundAmount }),
    });
  }

  async uploadDisputeEvidence(disputeId: string, formData: FormData) {
    if (!isApiConfigured()) throw new ApiError(UNAVAILABLE_MSG, 0);
    const url = buildApiUrl(`/disputes/${disputeId}/evidence`);
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${this.token ?? ''}`,
        ...(readCookie('csrf_token') ? { 'X-CSRF-Token': readCookie('csrf_token') as string } : {}),
      },
      body: formData,
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new ApiError(e.message || 'Upload failed', response.status);
    }
    return response.json();
  }

  // ── Admin ────────────────────────────────────────────────────────────────
  async getAdminStats() { return this.request('/admin/dashboard'); }
  async getAdminDashboard() { return this.request('/admin/dashboard'); }
  async getStaffPermissions() { return this.request('/staff/me/permissions'); }

  // ── Referral System (voucher-based) ─────────────────────────────────────
  async getMyReferralDashboard() { return this.request('/referrals/me'); }
  async validateReferralCode(code: string) {
    return this.request('/referrals/validate', { method: 'POST', body: JSON.stringify({ code }) });
  }
  async listReferralCampaigns() { return this.request('/referrals/campaigns'); }
  async createReferralCampaign(data: any) {
    return this.request('/referrals/campaigns', { method: 'POST', body: JSON.stringify(data) });
  }
  async updateReferralCampaignStatus(campaignId: string, status: 'active' | 'paused' | 'disabled' | 'expired') {
    return this.request(`/referrals/campaigns/${campaignId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }
  async getReferralAnalytics(period = '30d') {
    return this.request(`/referrals/analytics?period=${period}`);
  }
  async getReferralFraudEvents(status = 'pending', limit = 50) {
    return this.request(`/referrals/fraud?status=${status}&limit=${limit}`);
  }
  async reviewReferralFraudEvent(eventId: string, reviewStatus: 'confirmed_fraud' | 'false_positive', reviewNotes: string) {
    return this.request(`/referrals/fraud/${eventId}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ reviewStatus, reviewNotes }),
    });
  }

  async getAdminFundis(page = 1, status = 'pending') {
    return this.request(`/admin/fundis?page=${page}&status=${status}`);
  }

  async approveFundi(fundiId: string) {
    return this.request(`/admin/fundis/${fundiId}/approve`, { method: 'POST' });
  }

  async rejectFundi(fundiId: string, reason?: string) {
    return this.request(`/admin/fundis/${fundiId}/reject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    });
  }

  async getAdminCustomers(page = 1) {
    return this.request(`/admin/customers?page=${page}`);
  }

  async getAdminJobs(page = 1, status?: string) {
    let endpoint = `/admin/jobs?page=${page}`;
    if (status) endpoint += `&status=${status}`;
    return this.request(endpoint);
  }

  async getAdminPayments(page = 1) {
    return this.request(`/admin/payments?page=${page}`);
  }

  async getBypassAlerts(page = 1) {
    return this.request(`/admin/bypass-alerts?page=${page}`);
  }

  async getTrustScores(page = 1) {
    return this.request(`/admin/trust-scores?page=${page}`);
  }

  async getEscrowQueue(page = 1) {
    return this.request(`/admin/escrow-queue?page=${page}`);
  }

  async releaseEscrow(jobId: string) {
    return this.request(`/admin/escrow/${jobId}/release`, { method: 'POST' });
  }

  async freezeEscrow(jobId: string, reason: string) {
    return this.request(`/admin/escrow/${jobId}/freeze`, {
      method: 'POST', body: JSON.stringify({ reason }),
    });
  }

  async getAdminAuditLogs() { return this.request('/admin/audit-logs'); }

  async getAdminAnalytics(days = 30) {
    return this.request(`/admin/reports/analytics?days=${days}`);
  }

  async getSecurityOverview() { return this.request('/admin/security/overview'); }

  async getFraudDashboard(period = '30d') {
    return this.request(`/admin/fraud/dashboard?period=${period}`);
  }

  async getFraudAlerts(params: { period?: string; severity?: string; status?: string } = {}) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/admin/fraud/alerts${q ? `?${q}` : ''}`);
  }

  async getCommissionDebts(status?: string) {
    return this.request(`/admin/fraud/debts${status ? `?status=${status}` : ''}`);
  }

  async getSuspiciousJobs() { return this.request('/admin/fraud/suspicious-jobs'); }

  async getSuspiciousUsers(role?: string) {
    return this.request(`/admin/fraud/suspicious-users${role ? `?role=${role}` : ''}`);
  }

  async getFraudReports(period = '30d', format = 'json') {
    return this.request(`/admin/fraud/reports?period=${period}&format=${format}`);
  }

  async adminFraudAction(payload: Record<string, unknown>) {
    return this.request('/admin/fraud/actions', { method: 'POST', body: JSON.stringify(payload) });
  }

  // Admin verifyAdminToken compat shim (was server-side check in old backend)
  async verifyAdminToken() {
    return this.getCurrentUser();
  }

  // ── Notifications ────────────────────────────────────────────────────────
  async getNotifications() { return this.request('/notifications'); }

  async markNotificationRead(id: string) {
    return this.request(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'PATCH' });
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  async getJobMessages(jobId: string) {
    return this.request(`/jobs/${jobId}/messages`);
  }

  async sendJobMessage(jobId: string, body: string, imageUrl?: string) {
    return this.request(`/jobs/${jobId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, imageUrl }),
    });
  }

  async markJobMessagesRead(jobId: string) {
    return this.request(`/jobs/${jobId}/messages/read`, { method: 'POST' });
  }

  async reportFraud(payload: Record<string, unknown>) {
    const jobId = payload.jobId ? String(payload.jobId) : null;
    return this.request(jobId ? `/jobs/${jobId}/fraud-report` : '/fraud-report', {
      method: 'POST',
      body: JSON.stringify(payload),
      includeAuth: true,
    });
  }

  // ── Maps ─────────────────────────────────────────────────────────────────
  async reverseGeocode(latitude: number, longitude: number) {
    return this.request('/maps/reverse-geocode', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude }),
      includeAuth: false,
    });
  }

  async searchLocations(q: string) {
    return this.request(`/maps/search?q=${encodeURIComponent(q)}`, { includeAuth: false });
  }

  async getDirections(origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }) {
    return this.request('/maps/directions', {
      method: 'POST',
      body: JSON.stringify({ origin, destination }),
    });
  }

  // ── Staff Management (super_admin) ──────────────────────────────────────
  async createStaff(data: { email: string; password: string; fullName: string; phone?: string; role: string }) {
    return this.request('/admin/staff', { method: 'POST', body: JSON.stringify(data) });
  }
  async suspendStaff(userId: string, reason?: string) {
    return this.request(`/admin/staff/${userId}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) });
  }
  async reinstateStaff(userId: string) {
    return this.request(`/admin/staff/${userId}/reinstate`, { method: 'POST' });
  }
  async banUserPermanently(userId: string, reason?: string) {
    return this.request(`/admin/users/${userId}/ban`, { method: 'POST', body: JSON.stringify({ reason }) });
  }
  async setUserRole(userId: string, role: string) {
    return this.request(`/admin/users/${userId}/role`, { method: 'POST', body: JSON.stringify({ role }) });
  }
  async listRoles() { return this.request('/admin/roles'); }
  async listRolePermissions(role: string) { return this.request(`/admin/roles/${role}/permissions`); }
  async setUserPermission(userId: string, code: string, granted: boolean) {
    return this.request(`/admin/users/${userId}/permissions`, { method: 'POST', body: JSON.stringify({ code, granted }) });
  }

  // ── AI Command Center ───────────────────────────────────────────────────
  async getAiDashboard() { return this.request('/ai/dashboard'); }
  async runAiAnalysis() { return this.request('/ai/run', { method: 'POST' }); }
  async listAiRecommendations(params: { status?: string; category?: string } = {}) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/ai/recommendations${q ? `?${q}` : ''}`);
  }
  async reviewAiRecommendation(recId: string, action: 'approve' | 'reject' | 'reviewed', note?: string) {
    return this.request(`/ai/recommendations/${recId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, note }),
    });
  }
  async getAdminReportsAnalytics(days = 30) {
    return this.request(`/admin/reports/analytics?days=${days}`);
  }
}

export const apiClient = new ApiClient();
