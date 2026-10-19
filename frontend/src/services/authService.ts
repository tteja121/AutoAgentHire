/**
 * Backend & MongoDB Authentication Service
 * Manages user registration, login, logout, and profile management
 * using FastAPI backend with MongoDB Atlas document store.
 */
import { API_BASE_URL, apiClient, API_ENDPOINTS } from '@/lib/api';

export interface UserProfile {
  id: string | number;
  full_name: string | null;
  role: 'candidate' | 'recruiter' | 'authorizer' | string;
  avatar_url?: string | null;
  company_name?: string | null;
  custom_user_id?: string | null;
  email?: string;
  created_at?: string;
}

export const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com',
  'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'zoho.com', 'proton.me', 'protonmail.com', 'mail.com', 'gmx.com',
  'yandex.com', 'inbox.com'
]);

export function isPersonalEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@').pop()?.trim().toLowerCase() || '';
  return PERSONAL_EMAIL_DOMAINS.has(domain);
}

// Simple subscriber system for auth state listeners
const authSubscribers: ((event: string, session: any) => void)[] = [];

function notifyAuthSubscribers(event: string, session: any) {
  authSubscribers.forEach((cb) => {
    try {
      cb(event, session);
    } catch (e) {
      console.warn('Error in auth subscriber:', e);
    }
  });
}

export function clearAllAccountData() {
  const keysToRemove = [
    'authToken',
    'userRole',
    'candidate_email',
    'candidate_name',
    'candidate_phone',
    'candidate_location',
    'candidate_headline',
    'candidate_avatar_url',
    'candidate_experience',
    'candidate_summary',
    'candidate_skills',
    'candidate_skills_str',
    'candidate_resume_name',
    'candidate_profile',
    'client_applied_applications',
    'userProfile',
    'resumeData',
    'resumePath',
    'jobSearchConfig',
    // Legacy API keys — must not persist across accounts
    'GEMINI_API_KEY',
    'GROQ_API_KEY',
    'OPENAI_API_KEY',
  ];
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('client_applied_') || key.startsWith('candidate_') || key.startsWith('cached_apps_'))) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {}

  try {
    sessionStorage.clear();
  } catch (e) {}
}

export const authService = {
  isPersonalEmail,
  clearAllAccountData,

  /**
   * Register a new user with Backend Auth and initialize profile
   */
  async signUp(params: {
    email: string;
    password: string;
    fullName: string;
    role?: 'candidate' | 'recruiter' | string;
    companyName?: string;
  }) {
    const role = params.role || 'candidate';

    // Disallow personal emails for Recruiters
    if (role === 'recruiter' && isPersonalEmail(params.email)) {
      throw new Error(
        `Recruiters must register with an official company email address. Personal emails (@${params.email.split('@')[1]}) are not accepted.`
      );
    }

    const res = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email,
        password: params.password,
        full_name: params.fullName,
        role: role,
        company_name: params.companyName,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const errMsg = errJson?.detail || 'Account registration failed.';
      if (res.status === 400 && errMsg.toLowerCase().includes('already exists')) {
        throw new Error('An account with this email already exists. Please log in.');
      }
      throw new Error(errMsg);
    }

    const bData = await res.json();
    if (bData.access_token) {
      clearAllAccountData();
      localStorage.setItem('authToken', bData.access_token);
      localStorage.setItem('userRole', role);
      localStorage.setItem('candidate_email', params.email.trim().toLowerCase());
      notifyAuthSubscribers('SIGNED_IN', { access_token: bData.access_token, user: bData });
    }

    return {
      user: {
        id: bData.id || bData.uuid,
        email: params.email,
        user_metadata: { full_name: params.fullName, role },
      },
      custom_user_id: bData.custom_user_id || null,
      session: bData.access_token ? { access_token: bData.access_token } : null,
      requires_otp: Boolean(bData.requires_otp),
      dev_code: bData.dev_code || null,
      message: bData.message,
      email: bData.email || params.email,
    };
  },

  /**
   * Verify 6-digit OTP code to activate Client account
   */
  async verifySignupOtp(email: string, code: string) {
    const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.detail || 'Verification failed. Please check your code.');
    }

    const data = await res.json();
    if (data.access_token) {
      clearAllAccountData();
      localStorage.setItem('authToken', data.access_token);
      localStorage.setItem('userRole', data.role || 'candidate');
      localStorage.setItem('candidate_email', email.trim().toLowerCase());
      notifyAuthSubscribers('SIGNED_IN', { access_token: data.access_token, user: data });
    }
    return data;
  },

  /**
   * Resend 6-digit verification code
   */
  async resendSignupOtp(email: string) {
    const res = await fetch(`${API_BASE_URL}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.detail || 'Failed to resend verification code.');
    }

    return await res.json();
  },

  /**
   * Resolve User ID to registered official email via backend
   */
  async resolveUserId(userId: string, role?: string): Promise<{ email: string; role: string; custom_user_id: string; full_name?: string }> {
    const res = await fetch(`${API_BASE_URL}/auth/resolve-user-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId.trim(),
        role: role || undefined,
      }),
    });

    if (!res.ok) {
      let errDetail = 'Invalid User ID. Please check your assigned ID or log in with your email.';
      try {
        const errJson = await res.json();
        errDetail = errJson.detail || errDetail;
      } catch { }
      throw new Error(errDetail);
    }

    return await res.json();
  },

  /**
   * Universal Sign In supporting:
   * - Client (Email + Password)
   * - Recruiter (Official Email + Password OR User ID + Password)
   * - Authorizer (Official Email + Password OR User ID + Password)
   */
  async signIn(
    identifier: string,
    password: string,
    options?: {
      role?: 'client' | 'candidate' | 'recruiter' | 'authorizer';
      loginType?: 'email' | 'user_id';
    }
  ) {
    const cleanId = identifier.trim();
    const loginType = options?.loginType || (cleanId.includes('@') ? 'email' : 'user_id');
    const targetRole = options?.role === 'client' ? 'candidate' : options?.role;

    let emailToAuth = cleanId;
    let resolvedRole: string | undefined = targetRole;

    // 1. If logging in via User ID: Resolve User ID to registered email
    if (loginType === 'user_id' || !cleanId.includes('@')) {
      const resolved = await this.resolveUserId(cleanId, targetRole);
      emailToAuth = resolved.email;
      resolvedRole = resolved.role;
    }

    // 2. Official Email Validation for Recruiter / Authorizer
    if (targetRole && ['recruiter', 'authorizer'].includes(targetRole)) {
      const isDemoAuth = emailToAuth.toLowerCase() === 'author@auto.in';
      if (!isDemoAuth && isPersonalEmail(emailToAuth)) {
        const domain = emailToAuth.split('@')[1];
        throw new Error(
          `${targetRole.charAt(0).toUpperCase() + targetRole.slice(1)}s must use an official company email address. Personal email domains (@${domain}) are not permitted.`
        );
      }
    }

    // 3. Authenticate with backend API (/auth/login)
    const bRes = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailToAuth,
        password: password,
        role: targetRole || undefined,
        login_type: loginType,
      }),
    });

    if (!bRes.ok) {
      const errJson = await bRes.json().catch(() => null);
      throw new Error(errJson?.detail || 'Invalid email/User ID or password. Please verify your credentials.');
    }

    const backendResult = await bRes.json();
    const effectiveRole = backendResult.role || targetRole || resolvedRole || 'candidate';

    if (backendResult.access_token) {
      clearAllAccountData();
      localStorage.setItem('authToken', backendResult.access_token);
      localStorage.setItem('userRole', effectiveRole);
      localStorage.setItem('candidate_email', emailToAuth.trim().toLowerCase());
      notifyAuthSubscribers('SIGNED_IN', { access_token: backendResult.access_token, user: backendResult });
    }

    return {
      session: { access_token: backendResult.access_token },
      user: {
        id: backendResult.id || backendResult.uuid,
        email: emailToAuth,
        full_name: backendResult.full_name,
        user_metadata: {
          full_name: backendResult.full_name,
          role: effectiveRole,
        },
      },
      profile: {
        id: backendResult.id || backendResult.uuid,
        role: effectiveRole,
        full_name: backendResult.full_name,
        company_name: backendResult.company_name,
        custom_user_id: backendResult.custom_user_id,
      },
      role: effectiveRole,
    };
  },

  /**
   * Authenticate using Google OAuth token directly with backend
   */
  async signInWithGoogleToken(accessToken: string) {
    const res = await fetch(`${API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || 'Failed to authenticate with Google account.');
    }

    const data = await res.json();
    const role = data.role || 'candidate';
    if (data.access_token) {
      clearAllAccountData();
      localStorage.setItem('authToken', data.access_token);
      localStorage.setItem('userRole', role);
      if (data.email) {
        localStorage.setItem('candidate_email', data.email.trim().toLowerCase());
      }
      notifyAuthSubscribers('SIGNED_IN', { access_token: data.access_token, user: data });
    }
    return data;
  },

  /**
   * Sign in / Register with Google OAuth (direct redirect flow)
   */
  async signInWithGoogle(options?: { redirectTo?: string }) {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('Google OAuth Client ID is not configured.');
    }
    const callbackOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const redirectUri = encodeURIComponent(options?.redirectTo || `${callbackOrigin}/auth/callback`);
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}&scope=openid%20email%20profile`;
    window.location.href = googleAuthUrl;
  },

  /**
   * Sign out: clear session tokens, account data, and notify subscribers
   */
  async signOut() {
    clearAllAccountData();
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' }).catch(() => {});
    } catch (_) {}
    notifyAuthSubscribers('SIGNED_OUT', null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('authLogout'));
    }
  },

  /**
   * Get currently authenticated user and profile from backend /auth/me
   */
  async getCurrentUser() {
    const token = localStorage.getItem('authToken');
    if (!token) return null;

    try {
      const res = await apiClient.get(API_ENDPOINTS.auth.me);
      if (res.data) {
        const user = res.data;
        const role = user.role || localStorage.getItem('userRole') || 'candidate';
        localStorage.setItem('userRole', role);
        return {
          user,
          profile: user,
          role,
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Get user profile by user ID
   */
  async getProfile(userId: string | number): Promise<UserProfile | null> {
    try {
      const res = await apiClient.get(API_ENDPOINTS.auth.me);
      return res.data as UserProfile;
    } catch {
      return null;
    }
  },

  /**
   * Update current user profile
   */
  async updateProfile(userId: string | number, updates: Partial<UserProfile>) {
    const safeUpdates = { ...updates };
    delete (safeUpdates as any).role; // Prevent client-side role tampering

    const res = await apiClient.put(API_ENDPOINTS.settings.profile, safeUpdates);
    return res.data;
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange(callback: (event: string, session: any) => void) {
    authSubscribers.push(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            const idx = authSubscribers.indexOf(callback);
            if (idx >= 0) authSubscribers.splice(idx, 1);
          },
        },
      },
    };
  },
};

export default authService;
