import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export const PRODUCTION_BACKEND_URL = 'https://autoagenthire-1.onrender.com';
export const LOCAL_BACKEND_URL = 'http://127.0.0.1:8000';

/**
 * Normalizes and sanitizes a base URL:
 * - Trims whitespace and trailing slashes.
 * - Strips redundant trailing `/api` segments so that both `/api/...` and `/auth/...`
 *   routes can be appended without duplicate segments.
 */
function sanitizeBaseUrl(url: string): string {
  if (!url) return '';
  let clean = url.trim().replace(/\/+$/, '');
  if (clean.toLowerCase().endsWith('/api')) {
    clean = clean.slice(0, -4).replace(/\/+$/, '');
  }
  return clean;
}

/**
 * Production-safe API Base URL resolution:
 * - Reads VITE_API_URL or VITE_API_BASE_URL if configured.
 * - When running on a remote host (e.g. *.vercel.app, *.onrender.com):
 *   - If envUrl is set to a valid remote URL, uses that.
 *   - If envUrl is missing or points to localhost/127.0.0.1, automatically defaults
 *     to the production Render backend (https://autoagenthire.onrender.com) so requests
 *     never fail or fall back to broken local origins.
 * - In local development (localhost / 127.0.0.1):
 *   - Uses configured VITE_API_URL or defaults to http://127.0.0.1:8000.
 */
export const getApiBaseUrl = (): string => {
  const envUrl = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '').trim();

  // If in browser environment, check current host
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhostHost = hostname === 'localhost' || hostname === '127.0.0.1';

    // 1. If running on a remote host (e.g. Vercel, Render), route to production backend
    if (!isLocalhostHost) {
      if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
        return sanitizeBaseUrl(envUrl);
      }
      return PRODUCTION_BACKEND_URL;
    }

    // 2. Running locally in browser (localhost / 127.0.0.1)
    if (envUrl) {
      return sanitizeBaseUrl(envUrl);
    }
    return LOCAL_BACKEND_URL;
  }

  // Build time / SSR mode
  if (import.meta.env.PROD) {
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return sanitizeBaseUrl(envUrl);
    }
    return PRODUCTION_BACKEND_URL;
  }

  return sanitizeBaseUrl(envUrl) || LOCAL_BACKEND_URL;
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Resolves a full, normalized API URL given an endpoint path.
 * Normalizes slashes and prevents duplicate `/api` path segments.
 *
 * Examples:
 *   resolveApiUrl('/auth/google') => 'https://autoagenthire.onrender.com/auth/google'
 *   resolveApiUrl('/api/jobs')    => 'https://autoagenthire.onrender.com/api/jobs'
 */
export function resolveApiUrl(endpoint: string): string {
  if (!endpoint) return '';
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!base) {
    return cleanEndpoint;
  }
  return `${base}${cleanEndpoint}`;
}

/**
 * Generate authenticated URL for viewing/downloading resumes or documents.
 * Appends the current JWT session token as a query parameter so browser
 * window navigation (<a target="_blank"> or window.open) authenticates properly.
 */
export function getAuthenticatedFileUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  const token = localStorage.getItem('authToken');
  let fullUrl = rawUrl;
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('blob:')) {
    fullUrl = resolveApiUrl(rawUrl);
  }
  if (token && !fullUrl.includes('token=')) {
    fullUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }
  return fullUrl;
}

// ─── TypeScript Interfaces ────────────────────────────────────────────────────

export interface Job {
  id?: string;
  title: string;
  company: string;
  location: string;
  url?: string;
  description?: string;
  match_score?: number;
  status?: string;
  applied_at?: string;
}

export interface Application {
  id?: string;
  job_title?: string;
  company?: string;
  status?: string;
  applied_at?: string;
  match_score?: number;
  job_url?: string;
}

export interface AgentStatus {
  status: string;
  phase?: string;
  jobs_found?: number;
  applications_submitted?: number;
  applications_previewed?: number;
  errors?: string[];
  start_time?: string | null;
  end_time?: string | null;
  logs?: any[];
  detail?: string;
}

// ─── Axios Instance ───────────────────────────────────────────────────────────

// Create axios instance with default configuration
export const apiClient = {
  _axios: axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  }),

  // Attach interceptors below then expose get/post/put/patch/delete/postFormData
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this._axios.get(url, config);
  },
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this._axios.post(url, data, config);
  },
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this._axios.put(url, data, config);
  },
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this._axios.patch(url, data, config);
  },
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this._axios.delete(url, config);
  },
  /** Send multipart/form-data (for file uploads). */
  postFormData<T = any>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this._axios.post(url, formData, {
      ...config,
      headers: { ...(config?.headers || {}), 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Request interceptor – attach auth token and guarantee baseURL
apiClient._axios.interceptors.request.use(
  (config) => {
    if (!config.baseURL) {
      config.baseURL = getApiBaseUrl();
    }
    const rawToken = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('access_token');
    const token = rawToken?.trim();
    if (token && token !== 'undefined' && token !== 'null') {
      if (!config.headers) {
        (config as any).headers = {};
      }
      if (typeof (config.headers as any).set === 'function') {
        (config.headers as any).set('Authorization', `Bearer ${token}`);
      } else {
        (config.headers as any).Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor – pass errors to caller without hijacking user navigation or triggering loops
let isHandlingSessionExpiry = false;

apiClient._axios.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/signup') || url.includes('/auth/register');
      const isAuthPage = typeof window !== 'undefined' && (
        window.location.pathname === '/login' ||
        window.location.pathname === '/signup' ||
        window.location.pathname === '/auth/callback'
      );
      if (!isAuthEndpoint && !isAuthPage && !isHandlingSessionExpiry) {
        isHandlingSessionExpiry = true;
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('access_token');
        localStorage.removeItem('userRole');

        const detailMsg = error.response?.data?.detail;
        const expiryMsg = (typeof detailMsg === 'string' && detailMsg.toLowerCase().includes('expired'))
          ? 'Your session has expired. Please sign in again.'
          : 'Your session has expired or is invalid. Please sign in again.';

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:session_expired', {
            detail: { message: expiryMsg }
          }));
        }

        setTimeout(() => {
          isHandlingSessionExpiry = false;
        }, 1500);
      }
    }

    // Enhance connection refused / offline network error messages
    if (!error.response) {
      const activeBase = getApiBaseUrl();
      const isLocal = activeBase.includes('localhost') || activeBase.includes('127.0.0.1');
      if (isLocal) {
        error.message = `Unable to connect to local backend at ${activeBase}. Ensure the FastAPI server is running with: "python -m uvicorn backend.main:app --reload --port 8000".`;
      } else {
        error.message = `Unable to connect to backend server at ${activeBase}. Please check service status or backend deployment.`;
      }
    }

    return Promise.reject(error);
  },
);

// ─── API Endpoints ────────────────────────────────────────────────────────────

export const API_ENDPOINTS = {
  // Authentication
  auth: {
    login: '/auth/login',
    signup: '/auth/signup',
    register: '/auth/signup',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/auth/me',
    google: '/auth/google',
    changePassword: '/auth/change-password',
  },

  // Candidate Custom Recommendations & Preferences
  candidate: {
    recommendations: '/api/candidate/recommendations',
    preferences: '/api/candidate/preferences',
    skillsSuggestions: '/api/candidate/skills-suggestions',
  },

  // Jobs
  jobs: {
    list: '/api/jobs',
    search: '/api/jobs/search',
    saved: '/api/jobs/saved',
    sync: '/api/jobs/sync',
    details: (id: string | number, jobType: string = 'imported') => `/api/jobs/${id}?job_type=${jobType}`,
    toggleSave: (id: string | number) => `/api/jobs/${id}/save`,
    apply: '/api/v2/start-automation',
    automation: '/api/v2/start-automation',
    automationStatus: (sessionId: string) => `/api/v2/automation-status/${sessionId}`,
    automationResults: (sessionId: string) => `/api/v2/automation-results/${sessionId}`,
  },

  // Applications
  applications: {
    list: '/api/applications',
    create: '/api/applications',
    details: (id: string) => `/api/applications/${id}`,
    update: (id: string) => `/api/applications/${id}`,
    delete: (id: string) => `/api/applications/${id}`,
    stats: '/api/agent/status',
  },

  // Resume
  resume: {
    upload: '/api/upload-resume',
    parse: '/api/upload-resume',
    download: '/api/upload-resume',
    analyze: '/api/upload-resume',
  },

  // Cover Letter
  coverLetter: {
    generate: '/api/cover-letter/generate',
    templates: '/api/cover-letter/generate',
  },

  // ATS
  ats: {
    check: '/api/ats/match',
    score: '/api/ats/match',
    optimize: '/api/ats/match',
    parseResume: '/api/ats/parse-resume',
    currentProfile: '/api/ats/current-profile',
    optimizeResume: '/api/ats/optimize-resume',
    calibrateTarget: '/api/ats/calibrate-target',
    applyAll: '/api/ats/apply-all',
  },

  // Recruiter & Authorizer & Candidate Job Board
  recruiter: {
    createJob: '/api/recruiter/jobs',
    myJobs: '/api/recruiter/my-jobs',
    myApplications: '/api/recruiter/my-applications',
    updateApplicationStatus: (id: number) => `/api/recruiter/applications/${id}/status`,
    authorizerPendingJobs: '/api/recruiter/authorizer/pending-jobs',
    authorizeJob: (id: number) => `/api/recruiter/authorizer/jobs/${id}/action`,
    authorizerRecruiterRequests: '/api/recruiter/authorizer/recruiter-requests',
    authorizeRecruiterRequest: (id: number) => `/api/recruiter/authorizer/recruiter-requests/${id}/action`,
    authorizerCreateRecruiter: '/api/recruiter/authorizer/create-recruiter',
    authorizerUsers: '/api/recruiter/authorizer/users',
    authorizerDeleteUser: (id: number) => `/api/recruiter/authorizer/users/${id}`,
    authorizerAuditLogs: '/api/recruiter/authorizer/audit-logs',
    candidateJobs: '/api/recruiter/candidate/jobs',
    applyJob: (id: number) => `/api/recruiter/candidate/apply/${id}`,
    deleteJob: (id: number) => `/api/recruiter/jobs/${id}`,
  },

  // Settings & Profile
  settings: {
    profile: '/api/user/profile',
    updateProfile: '/api/user/profile',
    requestEmailVerification: '/api/user/email/request-verification',
    verifyEmailCode: '/api/user/email/verify-code',
    preferences: '/auth/me',
    apiKeys: '/auth/me',
  },

  // Notifications
  notifications: {
    list: '/api/user/notifications',
    markRead: (id: string | number) => `/api/user/notifications/${id}/read`,
    markAllRead: '/api/user/notifications/mark-all-read',
    clearAll: '/api/user/notifications',
    delete: (id: string | number) => `/api/user/notifications/${id}`,
  },


  // Agent control
  agent: {
    run: '/api/run-agent',
    status: '/api/agent/status',
    pause: '/api/agent/pause',
    resume: '/api/agent/resume',
    stop: '/api/agent/stop',
    statusById: (runId: string) => `/api/agent/status/${runId}`,
    results: (runId: string) => `/api/agent/results/${runId}`,
    uploadResume: '/api/agent/resume/upload',
    agentRuns: '/api/v2/agent-runs',
    v2Applications: '/api/v2/applications',
  },

  // Autoagenthire
  autoagenthire: {
    start: '/api/autoagenthire/start',
    searchJobs: '/api/autoagenthire/search-jobs',
    applySingle: '/api/autoagenthire/apply-single',
    run: (runId: string) => `/api/autoagenthire/run/${runId}`,
  },

  // MongoDB Atlas status & sync
  mongo: {
    status: '/api/mongo/status',
    sync: '/api/mongo/sync',
    jobs: '/api/mongo/jobs',
    applications: '/api/mongo/applications',
    users: '/api/mongo/users',
  },

  // Integrations & Job Portals
  integrations: {
    providers: '/api/integrations/providers',
    list: '/api/integrations',
    create: '/api/integrations',
    validate: (id: number) => `/api/integrations/${id}/validate`,
    delete: (id: number) => `/api/integrations/${id}`,
    sync: (id: number) => `/api/integrations/${id}/sync`,
    history: (id: number) => `/api/integrations/${id}/history`,
    applications: '/api/integrations/applications',
    websiteScan: '/api/integrations/website/scan',
    websiteImport: '/api/integrations/website/import',
    websiteHistory: '/api/integrations/website/history',
    websiteStatus: (id: number) => `/api/integrations/website/${id}/status`,
  },

  // Admin & Database Health
  admin: {
    databaseHealth: '/api/admin/database-health',
    integrationsHealth: '/api/admin/integrations/health',
  },

  // Practice (AI Interview & Technical Assessment)
  practice: {
    profile: '/api/practice/profile',
    startInterview: '/api/practice/interview/start',
    submitInterviewAnswer: (sessionId: number | string) => `/api/practice/interview/${sessionId}/answer`,
    finishInterview: (sessionId: number | string) => `/api/practice/interview/${sessionId}/finish`,
    startTest: '/api/practice/test/start',
    saveTestAnswer: (sessionId: number | string) => `/api/practice/test/${sessionId}/answer`,
    submitTest: (sessionId: number | string) => `/api/practice/test/${sessionId}/submit`,
    sessions: '/api/practice/sessions',
    sessionDetail: (sessionId: number | string) => `/api/practice/sessions/${sessionId}`,
    deleteSession: (sessionId: number | string) => `/api/practice/sessions/${sessionId}`,
    analytics: '/api/practice/analytics',
  },

  // Health check
  health: '/health',

  // ── Flat aliases (for services that import them at top-level) ───────────────
  searchJobs: '/api/jobs/search',
  getApplications: '/api/applications',
  uploadResume: '/api/upload-resume',
  generateCoverLetter: '/api/cover-letter/generate',
  answerQuestion: '/api/answer-question',
  matchProfile: '/api/match-profile',
  agentStatus: '/api/agent/status',
  pauseAgent: '/api/agent/pause',
  resumeAgent: '/api/agent/resume',
  stopAgent: '/api/agent/stop',
  agentResults: (runId: string) => `/api/agent/results/${runId}`,
  runAgent: '/api/run-agent',
} as const;

// ─── Convenience re-export ────────────────────────────────────────────────────

export const api = {
  get: <T = any>(url: string, config?: AxiosRequestConfig) => apiClient.get<T>(url, config),
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => apiClient.post<T>(url, data, config),
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => apiClient.put<T>(url, data, config),
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => apiClient.patch<T>(url, data, config),
  delete: <T = any>(url: string, config?: AxiosRequestConfig) => apiClient.delete<T>(url, config),
};

export default api;