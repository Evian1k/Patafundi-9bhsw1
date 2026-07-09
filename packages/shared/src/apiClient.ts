import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS, CLIENT_EVENTS } from './socketEvents';
import type { AuthResponse, User, Job, JobLocation, Message, SavedPlace, Notification, Payment, WalletBalance, WalletTransaction, PayoutRequest, Dispute, Review, Referral, Loyalty, FundiDashboard, FundiPublic, GeoFindFundisResult, SurgePricingResult, PriceBreakdown } from './types';

function resolveBaseUrl(): string {
  const FALLBACK = 'https://patafundi-9bhsw1.onrender.com';
  try {
    // @ts-ignore — process.env may not exist on RN
    if (typeof process !== 'undefined' && process.env?.API_URL) {
      // @ts-ignore
      return process.env.API_URL as string;
    }
  } catch {}
  try {
    // Use Expo Constants to read API_URL from app.json extra
    const Constants = require('expo-constants');
    const fromExtra = Constants?.default?.expoConfig?.extra?.API_URL
                   || Constants?.expoConfig?.extra?.API_URL;
    if (fromExtra) return fromExtra as string;
  } catch {}
  return FALLBACK;
}
const DEFAULT_API_URL = resolveBaseUrl();
const STORAGE_KEYS = { TOKEN: 'auth_token', REFRESH_TOKEN: 'refresh_token', USER: 'cached_user' } as const;

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private socket: Socket | null = null;
  private tokensLoaded: Promise<void>;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() { this.baseUrl = DEFAULT_API_URL; this.tokensLoaded = this.loadTokens(); }
  async ensureTokensLoaded(): Promise<void> { await this.tokensLoaded; }
  setBaseUrl(url: string) { if (url) this.baseUrl = url.replace(/\/$/, ''); }
  getBaseUrl(): string { return this.baseUrl; }

  private async loadTokens(): Promise<void> {
    try { this.token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN); this.refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN); }
    catch { this.token = null; this.refreshToken = null; }
  }
  private async saveTokens(token: string, refreshToken: string): Promise<void> {
    this.token = token; this.refreshToken = refreshToken;
    await AsyncStorage.multiSet([[STORAGE_KEYS.TOKEN, token], [STORAGE_KEYS.REFRESH_TOKEN, refreshToken]]);
  }
  private async clearTokens(): Promise<void> {
    this.token = null; this.refreshToken = null;
    await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.REFRESH_TOKEN, STORAGE_KEYS.USER]);
  }
  async cacheUser(user: User | null): Promise<void> { if (user) await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user)); else await AsyncStorage.removeItem(STORAGE_KEYS.USER); }
  async getCachedUser(): Promise<User | null> { try { const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER); return raw ? (JSON.parse(raw) as User) : null; } catch { return null; } }
  getToken(): string | null { return this.token; }
  isLoggedIn(): boolean { return !!this.token; }

  async request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json', ...((options.headers as Record<string, string>) || {}) };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    let response = await fetch(url, { ...options, headers });
    if (response.status === 401 && this.token && this.refreshToken) {
      const refreshed = await this.refreshTokens();
      if (refreshed) { headers['Authorization'] = `Bearer ${this.token}`; response = await fetch(url, { ...options, headers }); }
      else { await this.clearTokens(); const err = new Error('Session expired') as any; err.status = 401; err.code = 'SESSION_EXPIRED'; throw err; }
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      let userMessage = error.message || 'We couldn\'t complete your request right now. Please try again.';
      // Replace technical errors with user-friendly messages
      if (response.status === 403) { userMessage = 'You don\'t have permission to do this.'; }
      else if (response.status === 404) { userMessage = 'We couldn\'t find what you\'re looking for.'; }
      else if (response.status === 429) { userMessage = 'Too many requests. Please wait a moment and try again.'; }
      else if (response.status >= 500) { userMessage = 'Something went wrong on our end. Please try again in a moment.'; }
      else if (response.status === 503) { userMessage = 'Service temporarily unavailable. Please try again in 30 seconds.'; }
      const err = new Error(userMessage) as any;
      err.status = response.status; err.maintenanceMode = error.maintenanceMode; err.code = error.code; err.payload = error;
      if (response.status === 503) { err.code = 'SERVICE_UNAVAILABLE'; }
      throw err;
    }
    if (response.status === 204) return undefined as T;
    return response.json();
  }

  async upload(path: string, formData: FormData, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}/api${path}`;
    const headers: Record<string, string> = { ...((options.headers as Record<string, string>) || {}) };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    let response = await fetch(url, { ...options, method: options.method || 'POST', headers, body: formData });
    if (response.status === 401 && this.token && this.refreshToken) {
      const refreshed = await this.refreshTokens();
      if (refreshed) { headers['Authorization'] = `Bearer ${this.token}`; response = await fetch(url, { ...options, method: options.method || 'POST', headers, body: formData }); }
      else { await this.clearTokens(); throw Object.assign(new Error('Session expired'), { status: 401 }); }
    }
    if (!response.ok) { const error = await response.json().catch(() => ({ message: response.statusText })); throw Object.assign(new Error(error.message || 'Upload failed'), { status: response.status, payload: error }); }
    return response.json();
  }

  // Auth
  async register(email: string, password: string, fullName: string, phone: string, referralCode?: string): Promise<AuthResponse & { devOtp?: string }> { return this.request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, fullName, phone, referralCode }) }); }
  async registerFundi(payload: FormData): Promise<AuthResponse> { return this.upload('/auth/register/fundi', payload); }
  async login(email: string, password: string): Promise<AuthResponse> { const data = await this.request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); if (data.token) { await this.saveTokens(data.token, data.refreshToken || data.token); if (data.user) await this.cacheUser(data.user); } return data; }
  async logout(): Promise<void> { try { await this.request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: this.refreshToken }) }); } catch {} await this.clearTokens(); this.disconnectSocket(); }
  async refreshTokens(): Promise<boolean> { if (this.refreshPromise) return this.refreshPromise; this.refreshPromise = (async () => { try { if (!this.refreshToken) return false; const response = await fetch(`${this.baseUrl}/api/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: this.refreshToken }) }); if (!response.ok) return false; const data = await response.json(); if (data.token) { await this.saveTokens(data.token, data.refreshToken || this.refreshToken); return true; } return false; } catch { return false; } finally { this.refreshPromise = null; } })(); return this.refreshPromise; }
  async verifyOtp(email: string, code: string): Promise<AuthResponse> { const data = await this.request<AuthResponse>('/auth/otp-verify', { method: 'POST', body: JSON.stringify({ email, code }) }); if (data.token) { await this.saveTokens(data.token, data.refreshToken || data.token); if (data.user) await this.cacheUser(data.user); } return data; }
  async resendOtp(email: string): Promise<{ success: boolean; devOtp?: string }> { return this.request('/auth/otp-resend', { method: 'POST', body: JSON.stringify({ email }) }); }
  async forgotPassword(email: string): Promise<{ success: boolean }> { return this.request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }); }
  async resetPassword(token: string, password: string): Promise<{ success: boolean }> { return this.request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }); }

  // User
  getCurrentUser(): Promise<{ user: User }> { return this.request('/users/me'); }
  updateProfile(data: Partial<User> & { fullName?: string; phone?: string }): Promise<{ user: User }> { return this.request('/users/me', { method: 'PUT', body: JSON.stringify(data) }); }
  changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean }> { return this.request('/users/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); }
  deleteAccount(): Promise<{ success: boolean }> { return this.request('/users/delete-account', { method: 'POST' }); }
  getSavedPlaces(): Promise<{ places: SavedPlace[] }> { return this.request('/users/saved-places'); }
  addSavedPlace(data: Omit<SavedPlace, 'id'>): Promise<{ place: SavedPlace }> { return this.request('/users/saved-places', { method: 'POST', body: JSON.stringify(data) }); }
  deleteSavedPlace(id: string): Promise<{ success: boolean }> { return this.request(`/users/saved-places/${id}`, { method: 'DELETE' }); }

  // Jobs
  createJob(data: { serviceCategory: string; description: string; estimatedPrice?: number; urgency?: 'normal' | 'emergency'; latitude?: number; longitude?: number; address?: string; }): Promise<{ job: Job }> { return this.request('/jobs', { method: 'POST', body: JSON.stringify(data) }); }
  listJobs(filters?: { status?: string; limit?: number; offset?: number }): Promise<{ jobs: Job[] }> { const qs = filters ? '?' + new URLSearchParams(filters as any).toString() : ''; return this.request(`/jobs${qs}`); }
  getActiveJob(): Promise<{ job: Job | null }> { return this.request('/jobs/fundi/active'); }
  getJob(id: string): Promise<{ job: Job }> { return this.request(`/jobs/${id}`); }
  patchJob(id: string, data: Partial<Job>): Promise<{ job: Job }> { return this.request(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
  updateJobStatus(id: string, status: string, notes?: string): Promise<{ job: Job }> { return this.request(`/jobs/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, notes }) }); }
  getJobStatus(id: string): Promise<{ status: string }> { return this.request(`/jobs/${id}/status`); }
  getJobLocation(id: string): Promise<JobLocation & { latitude: number; longitude: number }> { return this.request(`/jobs/${id}/location`); }
  uploadJobPhotos(id: string, photos: { uri: string; type?: string; name?: string }[]): Promise<{ photos: any[] }> { const fd = new FormData(); photos.forEach(p => fd.append('photos', { uri: p.uri, type: p.type || 'image/jpeg', name: p.name || `photo-${Date.now()}.jpg` } as any)); return this.upload(`/jobs/${id}/photos`, fd); }
  acceptJob(id: string): Promise<{ job: Job }> { return this.request(`/jobs/${id}/accept`, { method: 'POST' }); }
  cancelJob(id: string, reason?: string): Promise<{ job: Job }> { return this.request(`/jobs/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }); }
  checkIn(id: string, lat: number, lng: number): Promise<{ job: Job }> { return this.request(`/jobs/${id}/check-in`, { method: 'POST', body: JSON.stringify({ latitude: lat, longitude: lng }) }); }
  completeJob(id: string, photos?: { uri: string; type?: string; name?: string }[]): Promise<{ job: Job }> { if (photos && photos.length) { const fd = new FormData(); photos.forEach(p => fd.append('photos', { uri: p.uri, type: p.type || 'image/jpeg', name: p.name || `photo-${Date.now()}.jpg` } as any)); return this.upload(`/jobs/${id}/complete`, fd); } return this.request(`/jobs/${id}/complete`, { method: 'POST' }); }
  confirmCompletion(id: string, otp?: string): Promise<{ job: Job }> { return this.request(`/jobs/${id}/confirm-completion`, { method: 'POST', body: JSON.stringify({ otp }) }); }
  submitReview(jobId: string, rating: number, comment: string): Promise<{ review: Review }> { return this.request(`/jobs/${jobId}/review`, { method: 'POST', body: JSON.stringify({ rating, comment }) }); }

  // Chat
  getJobMessages(jobId: string): Promise<{ messages: Message[] }> { return this.request(`/jobs/${jobId}/messages`); }
  sendMessage(jobId: string, text: string, type: 'text' | 'image' = 'text'): Promise<{ message: Message }> { return this.request(`/jobs/${jobId}/messages`, { method: 'POST', body: JSON.stringify({ text, type }) }); }

  // Payments
  stkPush(jobId: string, phone: string): Promise<{ success: boolean; checkoutRequest_id?: string; customerMessage?: string }> { return this.request('/payments/stk-push', { method: 'POST', body: JSON.stringify({ jobId, phone }) }); }
  getPaymentForJob(jobId: string): Promise<{ payment: Payment }> { return this.request(`/payments/job/${jobId}`); }
  getWalletBalance(): Promise<{ balance: WalletBalance }> { return this.request('/payments/wallet/balance'); }
  requestPayout(amount: number, method: string, destination: string): Promise<{ payout: PayoutRequest }> { return this.request('/payouts/request', { method: 'POST', body: JSON.stringify({ amount, method, destination }) }); }

  // Disputes
  createDispute(data: { jobId: string; reason: string; description: string }): Promise<{ dispute: Dispute }> { return this.request('/disputes', { method: 'POST', body: JSON.stringify(data) }); }
  listDisputes(): Promise<{ disputes: Dispute[] }> { return this.request('/disputes'); }
  uploadDisputeEvidence(id: string, files: { uri: string; type?: string; name?: string }[]): Promise<{ dispute: Dispute }> { const fd = new FormData(); files.forEach(f => fd.append('evidence', { uri: f.uri, type: f.type || 'image/jpeg', name: f.name || `evidence-${Date.now()}.jpg` } as any)); return this.upload(`/disputes/${id}/evidence`, fd); }

  // Fundi
  registerFundiProfile(payload: FormData): Promise<{ success: boolean }> { return this.upload('/fundi/register', payload); }
  getOnboardingStatus(): Promise<{ status: string; steps: any }> { return this.request('/fundi/onboarding-status'); }
  getFundiProfile(): Promise<{ fundi: any }> { return this.request('/fundi/profile'); }
  updateFundiProfile(data: any): Promise<{ fundi: any }> { return this.request('/fundi/profile', { method: 'PUT', body: JSON.stringify(data) }); }
  getApprovalStatus(): Promise<{ status: string; message?: string }> { return this.request('/fundi/approval-status'); }
  searchFundis(lat: number, lng: number, category?: string): Promise<{ fundis: FundiPublic[] }> { const qs = new URLSearchParams({ latitude: String(lat), longitude: String(lng), ...(category ? { category } : {}) }).toString(); return this.request(`/fundi/search?${qs}`); }
  getFundiDashboard(): Promise<FundiDashboard> { return this.request('/fundi/dashboard'); }
  getFundiStatus(): Promise<{ online: boolean }> { return this.request('/fundi/status'); }
  goOnline(): Promise<{ success: boolean }> { return this.request('/fundi/status/online', { method: 'POST' }); }
  goOffline(): Promise<{ success: boolean }> { return this.request('/fundi/status/offline', { method: 'POST' }); }
  updateLocation(lat: number, lng: number, accuracy?: number, jobId?: string): Promise<{ success: boolean }> { return this.request('/fundi/location', { method: 'POST', body: JSON.stringify({ latitude: lat, longitude: lng, accuracy, jobId }) }); }
  getWalletTransactions(): Promise<{ transactions: WalletTransaction[]; balance: WalletBalance }> { return this.request('/fundi/wallet/transactions'); }
  getFundiRatings(): Promise<{ reviews: Review[]; average: number; count: number }> { return this.request('/fundi/ratings'); }
  getFundiPublic(id: string): Promise<{ fundi: FundiPublic }> { return this.request(`/fundi/${id}`); }
  getFundiReviews(id: string): Promise<{ reviews: Review[]; average: number; count: number }> { return this.request(`/fundi/${id}/reviews`); }
  getFundiPortfolio(id: string): Promise<{ portfolio: any[] }> { return this.request(`/fundi/${id}/portfolio`); }
  uploadPortfolioItem(image: { uri: string; type?: string; name?: string }): Promise<{ item: any }> { const fd = new FormData(); fd.append('image', { uri: image.uri, type: image.type || 'image/jpeg', name: image.name || `portfolio-${Date.now()}.jpg` } as any); return this.upload('/fundi/portfolio/upload', fd); }
  deletePortfolioItem(id: string): Promise<{ success: boolean }> { return this.request(`/fundi/portfolio/${id}`, { method: 'DELETE' }); }
  getAvailability(): Promise<{ availability: any }> { return this.request('/fundi/availability'); }
  updateAvailability(data: any): Promise<{ availability: any }> { return this.request('/fundi/availability', { method: 'PUT', body: JSON.stringify(data) }); }
  getEarningsAnalytics(): Promise<{ analytics: any }> { return this.request('/fundi/earnings/analytics'); }

  // Geo
  findFundis(lat: number, lng: number, serviceCategory: string, isEmergency = false): Promise<GeoFindFundisResult> { return this.request('/geo/find-fundis', { method: 'POST', body: JSON.stringify({ latitude: lat, longitude: lng, serviceCategory, isEmergency }) }); }
  getSurgePricing(basePrice: number, distanceKm: number, isEmergency = false, isNight = false): Promise<SurgePricingResult> { return this.request('/geo/surge-pricing', { method: 'POST', body: JSON.stringify({ basePrice, distanceKm, isEmergency, isNight }) }); }

  // ── Pricing Engine (platform-calculated, no customer budgets) ──
  calculatePrice(params: {
    serviceCategory: string;
    latitude?: number;
    longitude?: number;
    county?: string;
    isEmergency?: boolean;
    isImmediate?: boolean;
    complexity?: 'simple' | 'medium' | 'complex' | 'expert';
    weatherCondition?: string | null;
    scheduledFor?: string | null;
    fundiId?: string | null;
  }): Promise<{ success: boolean; calculationId: string; price: PriceBreakdown }> {
    return this.request('/pricing/calculate', { method: 'POST', body: JSON.stringify(params) });
  }
  listServicePrices(): Promise<{ success: boolean; services: any[] }> { return this.request('/pricing/services'); }

  // Referral + Loyalty
  getReferralDashboard(): Promise<Referral> { return this.request('/referrals/me'); }
  validateReferral(code: string): Promise<{ valid: boolean; reward?: number }> { return this.request('/referrals/validate', { method: 'POST', body: JSON.stringify({ code }) }); }
  getLoyalty(): Promise<{ loyalty: Loyalty }> { return this.request('/loyalty/me'); }

  // Notifications
  getNotifications(): Promise<{ notifications: Notification[] }> { return this.request('/notifications'); }
  markAllNotificationsRead(): Promise<{ success: boolean }> { return this.request('/notifications/read-all', { method: 'PATCH' }); }
  markNotificationRead(id: string): Promise<{ success: boolean }> { return this.request(`/notifications/${id}/read`, { method: 'PATCH' }); }
  registerDeviceToken(token: string, platform: 'android' | 'ios'): Promise<{ success: boolean }> { return this.request('/devices/register', { method: 'POST', body: JSON.stringify({ token, platform }) }); }

  // Security
  setup2FA(): Promise<{ qrCode: string; secret: string; recoveryCodes: string[] }> { return this.request('/security/2fa/setup', { method: 'POST' }); }
  verify2FA(code: string): Promise<{ success: boolean }> { return this.request('/security/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }); }
  disable2FA(code: string): Promise<{ success: boolean }> { return this.request('/security/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) }); }
  getActiveSessions(): Promise<{ sessions: any[] }> { return this.request('/security/sessions'); }
  terminateSession(id: string): Promise<{ success: boolean }> { return this.request(`/security/sessions/${id}`, { method: 'DELETE' }); }
  terminateAllSessions(): Promise<{ success: boolean }> { return this.request('/security/sessions', { method: 'DELETE' }); }
  getLoginHistory(): Promise<{ history: any[] }> { return this.request('/security/login-history'); }

  // SOS
  triggerSOS(data: { jobId?: string; latitude: number; longitude: number; message?: string }): Promise<{ success: boolean; sosId: string }> { return this.request('/sos/trigger', { method: 'POST', body: JSON.stringify(data) }); }

  // Verification
  getLivenessChallenges(): Promise<{ challenges: any[] }> { return this.request('/verification/challenges'); }
  startLiveness(): Promise<{ sessionId: string; challenge: any }> { return this.request('/verification/liveness/start', { method: 'POST' }); }
  submitLivenessFrame(sessionId: string, frame: { uri: string; type?: string; name?: string }): Promise<{ success: boolean; matched?: boolean }> { const fd = new FormData(); fd.append('frame', { uri: frame.uri, type: frame.type || 'image/jpeg', name: frame.name || 'frame.jpg' } as any); return this.upload(`/verification/liveness/${sessionId}/frame`, fd); }
  finishLiveness(sessionId: string): Promise<{ verified: boolean; reason?: string }> { return this.request(`/verification/liveness/${sessionId}/complete`, { method: 'POST' }); }
  getVerificationStatus(): Promise<{ status: string; level: string }> { return this.request('/verification/status'); }

  // Support
  createSupportTicket(data: { subject: string; message: string; category?: string; jobId?: string }): Promise<{ ticket: any }> { return this.request('/support/ticket', { method: 'POST', body: JSON.stringify(data) }); }

  // ── Content: Policies, Help, Blog, Services ───────────────
  getPolicy(slug: string): Promise<{ policy: any }> { return this.request(`/policies/${slug}`); }
  getHelp(): Promise<{ help: any }> { return this.request('/help'); }
  listBlogPosts(): Promise<{ posts: any[] }> { return this.request('/blog'); }
  getBlogPost(slug: string): Promise<{ post: any }> { return this.request(`/blog/${slug}`); }
  getServiceDetails(slug: string): Promise<{ service: any; fundis: any[] }> { return this.request(`/services/${slug}`); }

  // ── Favorites ──────────────────────────────────────────────
  listFavoriteFundis(): Promise<{ favorites: FundiPublic[] }> { return this.request('/favorites/fundis'); }
  addFavoriteFundi(fundiId: string): Promise<{ success: boolean }> { return this.request('/favorites/fundis', { method: 'POST', body: JSON.stringify({ fundiId }) }); }
  removeFavoriteFundi(fundiId: string): Promise<{ success: boolean }> { return this.request(`/favorites/fundis/${fundiId}`, { method: 'DELETE' }); }

  // GDPR
  requestDataExport(): Promise<{ success: boolean; requestId: string }> { return this.request('/gdpr/export', { method: 'POST' }); }
  requestDataDeletion(): Promise<{ success: boolean; requestId: string }> { return this.request('/gdpr/deletion', { method: 'POST' }); }

  // Socket
  connectSocket(): Socket | null {
    if (this.socket?.connected) return this.socket;
    if (!this.token) return null;
    this.socket = io(this.baseUrl, { auth: { token: this.token }, transports: ['websocket'], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 5000, timeout: 20000 });
    this.socket.on('connect_error', (err) => { console.warn('[socket] connect_error', err.message); });
    return this.socket;
  }
  disconnectSocket(): void { if (this.socket) { this.socket.removeAllListeners(); this.socket.disconnect(); this.socket = null; } }
  getSocket(): Socket | null { return this.socket; }
  subscribeToJob(jobId: string, handlers: { onStatus?: (p: any) => void; onLocation?: (p: any) => void; onMessage?: (p: any) => void; onPayment?: (p: any) => void; onCompleted?: (p: any) => void; onCancelled?: (p: any) => void; }): () => void {
    const socket = this.connectSocket(); if (!socket) return () => {};
    socket.emit(CLIENT_EVENTS.JOB_SUBSCRIBE, { jobId });
    if (handlers.onStatus) socket.on(SOCKET_EVENTS.JOB_STATUS, handlers.onStatus);
    if (handlers.onLocation) socket.on(SOCKET_EVENTS.FUNDI_LOCATION_UPDATE, handlers.onLocation);
    if (handlers.onMessage) socket.on(SOCKET_EVENTS.CHAT_MESSAGE, handlers.onMessage);
    if (handlers.onPayment) socket.on(SOCKET_EVENTS.PAYMENT_CONFIRMED, handlers.onPayment);
    if (handlers.onCompleted) socket.on(SOCKET_EVENTS.JOB_COMPLETED, handlers.onCompleted);
    if (handlers.onCancelled) socket.on(SOCKET_EVENTS.JOB_CANCELLED, handlers.onCancelled);
    return () => { socket.emit(CLIENT_EVENTS.JOB_UNSUBSCRIBE, { jobId }); socket.off(SOCKET_EVENTS.JOB_STATUS); socket.off(SOCKET_EVENTS.FUNDI_LOCATION_UPDATE); socket.off(SOCKET_EVENTS.CHAT_MESSAGE); socket.off(SOCKET_EVENTS.PAYMENT_CONFIRMED); socket.off(SOCKET_EVENTS.JOB_COMPLETED); socket.off(SOCKET_EVENTS.JOB_CANCELLED); };
  }
  emitLocationUpdate(jobId: string, latitude: number, longitude: number, accuracy?: number): void { if (this.socket?.connected) this.socket.emit(CLIENT_EVENTS.FUNDI_LOCATION_UPDATE, { jobId, latitude, longitude, accuracy }); }
  emitTyping(jobId: string, isTyping: boolean): void { if (this.socket?.connected) this.socket.emit(CLIENT_EVENTS.CHAT_TYPING, { jobId, isTyping }); }
}
export const apiClient = new ApiClient();
export default apiClient;
