/**
 * API Client for PataFundi Backend
 * Production-hardened: graceful degradation, automatic retry, no crash on missing env.
 */

import { env, isApiConfigured } from '@/config/env';

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

// Generic user-facing message — never expose env var names
const UNCONFIGURED_MSG = 'This feature is temporarily unavailable. Please try again later.';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  }

  getHeaders(includeAuth = true): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (includeAuth && this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  async request(
    endpoint: string,
    options: Record<string, unknown> = {},
    retries = 2,
  ): Promise<unknown> {
    if (!isApiConfigured()) {
      throw new ApiError(UNCONFIGURED_MSG, 0);
    }

    const url = `${env.API_URL}${endpoint}`;
    const config: RequestInit = {
      ...(options as RequestInit),
      headers: {
        ...this.getHeaders((options.includeAuth as boolean) !== false),
        ...(options.headers as Record<string, string> ?? {}),
      },
    };

    if (
      config.body &&
      typeof config.body === 'object' &&
      !(config.body instanceof FormData)
    ) {
      config.body = JSON.stringify(config.body);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      let response: Response;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        response = await fetch(url, { ...config, signal: controller.signal });
        clearTimeout(timeoutId);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
          if (attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
          throw new ApiError('Request timed out. Please check your connection.', 0);
        }
        const msg = e instanceof Error ? e.message : 'Network error';
        if (attempt < retries && !msg.includes('Failed to fetch')) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new ApiError('Unable to connect. Please check your internet connection.', 0);
      }

      // Retry on 5xx
      if (response.status >= 500 && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText })) as {
          message?: string;
          meta?: unknown;
        };
        throw new ApiError(
          error?.message || response.statusText || 'Request failed',
          response.status,
          error?.meta,
        );
      }

      return response.json();
    }

    throw new ApiError('Unable to complete request. Please try again.', 0);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  async register(email: string, password: string, fullName: string, phone: string | null = null, role = 'customer') {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, phone, role }),
      includeAuth: false,
    });
  }

  async otpVerify(email: string, code: string, purpose = 'register') {
    const data = await this.request('/auth/otp-verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, purpose }),
      includeAuth: false,
    }) as { token?: string };
    if (data?.token) this.setToken(data.token);
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
    if (data?.token) this.setToken(data.token);
    return data;
  }

  async logout() {
    try { await this.request('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    finally { this.setToken(null); }
  }

  async getCurrentUser(): Promise<{ user: Record<string, unknown> }> {
    return this.request('/users/me') as Promise<{ user: Record<string, unknown> }>;
  }

  // ── User / Settings ──────────────────────────────────────────────────────
  async updateMe({ fullName = null, phone = null }: { fullName?: string | null; phone?: string | null } = {}) {
    return this.request('/users/me', { method: 'PUT', body: JSON.stringify({ fullName, phone }) });
  }

  async getUserSettings() { return this.request('/users/settings'); }

  async updateUserSettings(payload: Record<string, unknown>) {
    return this.request('/users/settings', { method: 'PUT', body: JSON.stringify(payload) });
  }

  async getSavedPlaces() { return this.request('/users/saved-places'); }

  async addSavedPlace(place: Record<string, unknown>) {
    return this.request('/users/saved-places', { method: 'POST', body: JSON.stringify(place) });
  }

  async updateSavedPlace(id: string, updates: Record<string, unknown>) {
    return this.request(`/users/saved-places/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
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
    if (!isApiConfigured()) throw new ApiError(UNCONFIGURED_MSG, 0);
    const url = `${env.API_URL}/fundi/register`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 90_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token ?? ''}` },
        body: formData,
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw new Error('Registration timed out. Please try again.');
      throw e;
    } finally { clearTimeout(t); }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new Error(error.message || 'Registration failed');
    }
    return response.json();
  }

  async getFundiProfile() { return this.request('/fundi/profile'); }
  async getFundiApprovalStatus() { return this.request('/fundi/approval-status'); }

  async updateFundiProfile(data: Record<string, unknown>) {
    return this.request('/fundi/profile', { method: 'PUT', body: JSON.stringify(data) });
  }

  async getFundi(fundiId: string) {
    return this.request(`/fundi/${fundiId}`, { includeAuth: false });
  }

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
    return this.request('/fundi/wallet/withdraw-request', {
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

  async updateLocation(latitude: number, longitude: number, accuracy?: number) {
    return this.request('/fundi/location', {
      method: 'POST', body: JSON.stringify({ latitude, longitude, accuracy }),
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
    if (!isApiConfigured()) throw new ApiError(UNCONFIGURED_MSG, 0);
    const formData = new FormData();
    formData.append('finalPrice', String(finalPrice));
    photos.forEach((photo) => formData.append('photos', photo));
    const url = `${env.API_URL}/jobs/${jobId}/complete`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token ?? ''}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new Error(error.message || 'Job completion failed');
    }
    return response.json();
  }

  async confirmJobCompletion(jobId: string, otp: string) {
    return this.request(`/jobs/${jobId}/confirm-completion`, {
      method: 'POST', body: JSON.stringify({ otp }),
    });
  }

  // ── Payments ─────────────────────────────────────────────────────────────
  async getPaymentForJob(jobId: string) { return this.request(`/payments/job/${jobId}`); }

  async processPayment(jobId: string, mpesaNumber: string, paymentMethod = 'mpesa') {
    return this.request(`/payments/process/${jobId}`, {
      method: 'POST', body: JSON.stringify({ mpesaNumber, paymentMethod }),
    });
  }

  async getEscrowStatus(jobId: string) { return this.request(`/payments/escrow/${jobId}`); }

  // ── Reviews ──────────────────────────────────────────────────────────────
  async submitReview(jobId: string, rating: number, comment: string) {
    return this.request(`/jobs/${jobId}/review`, {
      method: 'POST', body: JSON.stringify({ rating, comment }),
    });
  }

  async getReviewsForFundi(fundiId: string, limit = 10, offset = 0) {
    return this.request(`/fundi/${fundiId}/reviews?limit=${limit}&offset=${offset}`, { includeAuth: false });
  }

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
    return this.request(endpoint, { includeAuth: true });
  }

  async resolveDispute(disputeId: string, resolution: string, refundAmount?: number) {
    return this.request(`/admin/disputes/${disputeId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution, refundAmount }),
      includeAuth: true,
    });
  }

  // ── Admin ────────────────────────────────────────────────────────────────
  async getBypassAlerts(page = 1, limit = 20) {
    return this.request(`/admin/bypass-alerts?page=${page}&limit=${limit}`, { includeAuth: true });
  }

  async getTrustScores(page = 1, limit = 20) {
    return this.request(`/admin/trust-scores?page=${page}&limit=${limit}`, { includeAuth: true });
  }

  async getEscrowQueue(page = 1) {
    return this.request(`/admin/escrow-queue?page=${page}`, { includeAuth: true });
  }

  async releaseEscrow(jobId: string) {
    return this.request(`/admin/escrow/${jobId}/release`, { method: 'POST', includeAuth: true });
  }

  async freezeEscrow(jobId: string, reason: string) {
    return this.request(`/admin/escrow/${jobId}/freeze`, {
      method: 'POST', body: JSON.stringify({ reason }), includeAuth: true,
    });
  }
}

export const apiClient = new ApiClient();
