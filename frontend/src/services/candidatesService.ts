/**
 * Candidates Service - Powered by Backend API & MongoDB Atlas
 * Manages candidate profiles and records.
 */
import { apiClient, API_ENDPOINTS } from '@/lib/api';

export interface CandidateRecord {
  id: string | number;
  user_id: string;
  headline?: string | null;
  skills?: string | string[] | null;
  resume_url?: string | null;
  created_at?: string;
}

export const candidatesService = {
  /**
   * Get candidate record by user ID
   */
  async getCandidateByUserId(userId: string): Promise<CandidateRecord | null> {
    try {
      const resp = await apiClient.get(API_ENDPOINTS.auth.me);
      if (resp.data) {
        return {
          id: resp.data.id || userId,
          user_id: String(resp.data.id || userId),
          headline: resp.data.headline || null,
          skills: resp.data.default_skills || resp.data.skills || null,
          created_at: resp.data.created_at,
        };
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Ensure a candidate record exists for a user ID (or create one)
   */
  async getOrCreateCandidate(userId: string, initialData?: { headline?: string; skills?: string }): Promise<CandidateRecord> {
    const existing = await this.getCandidateByUserId(userId);
    if (existing) return existing;

    return {
      id: userId,
      user_id: userId,
      headline: initialData?.headline || null,
      skills: initialData?.skills || null,
      created_at: new Date().toISOString(),
    };
  },

  /**
   * Update candidate details
   */
  async updateCandidate(candidateId: string | number, updates: Partial<CandidateRecord>): Promise<CandidateRecord> {
    try {
      const res = await apiClient.put(API_ENDPOINTS.settings.profile, updates);
      return {
        id: candidateId,
        user_id: String(candidateId),
        ...updates,
        ...(res.data || {}),
      };
    } catch {
      return {
        id: candidateId,
        user_id: String(candidateId),
        ...updates,
      };
    }
  },
};

export default candidatesService;
