/**
 * In-Memory Active Resume Analysis Session Manager
 *
 * Keeps active resume analysis state in browser runtime memory so that:
 * 1. Switching between Autonomous Agent (/dashboard/automation) and Resume Intelligence (/dashboard/resume)
 *    seamlessly preserves the active analysis during the user's active session.
 * 2. Full browser refresh (F5/reload) resets memory naturally, ensuring the UI begins with a clean,
 *    empty upload interface without automatically restoring prior analysis.
 * 3. Database records (candidate profile, application history, stored resumes) remain intact.
 */

export interface ActiveResumeSessionData {
  profile: any;
  parsedData: any;
  matchedJobs?: any[];
  file?: File | null;
  fileName?: string;
  previewUrl?: string | null;
  rawText?: string;
  recommendedDesignations?: any[];
  atsAnalysis?: any;
  timestamp: number;
}

let activeSession: ActiveResumeSessionData | null = null;
const listeners = new Set<(session: ActiveResumeSessionData | null) => void>();

export function getActiveResumeSession(): ActiveResumeSessionData | null {
  return activeSession;
}

export function setActiveResumeSession(data: Partial<ActiveResumeSessionData> | null) {
  if (!data) {
    activeSession = null;
  } else {
    activeSession = {
      profile: data.profile ?? activeSession?.profile ?? null,
      parsedData: data.parsedData ?? activeSession?.parsedData ?? null,
      matchedJobs: data.matchedJobs ?? activeSession?.matchedJobs ?? [],
      file: data.file !== undefined ? data.file : (activeSession?.file ?? null),
      fileName: data.fileName || data.file?.name || activeSession?.fileName || '',
      previewUrl: data.previewUrl !== undefined ? data.previewUrl : (activeSession?.previewUrl ?? null),
      rawText: data.rawText ?? activeSession?.rawText ?? '',
      recommendedDesignations: data.recommendedDesignations ?? activeSession?.recommendedDesignations ?? [],
      atsAnalysis: data.atsAnalysis ?? activeSession?.atsAnalysis ?? null,
      timestamp: Date.now(),
    };
  }

  listeners.forEach((listener) => {
    try {
      listener(activeSession);
    } catch (err) {
      console.warn('[ActiveResumeSession] Listener error:', err);
    }
  });

  try {
    window.dispatchEvent(new CustomEvent('activeResumeSessionChanged', { detail: activeSession }));
  } catch {}
}

export function clearActiveResumeSession() {
  activeSession = null;
  listeners.forEach((listener) => {
    try {
      listener(null);
    } catch (err) {
      console.warn('[ActiveResumeSession] Listener error:', err);
    }
  });
  try {
    window.dispatchEvent(new CustomEvent('activeResumeSessionChanged', { detail: null }));
  } catch {}
}

export function subscribeToActiveResumeSession(
  callback: (session: ActiveResumeSessionData | null) => void
): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
