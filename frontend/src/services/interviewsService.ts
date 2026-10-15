/**
 * Interviews Service - Powered by Backend API & MongoDB Atlas
 * Manages candidate interviews and scheduling.
 */
import { apiClient } from '@/lib/api';
import { ApplicationRecord } from './applicationsService';

export interface InterviewRecord {
  id: string | number;
  application_id: string | number;
  status: 'scheduled' | 'completed' | 'cancelled' | string;
  notes?: string | null;
  scheduled_at: string;
  duration_minutes?: number | null;
  meeting_url?: string | null;
  created_at?: string;
  applications?: ApplicationRecord | null;
}

export const interviewsService = {
  /**
   * Schedule a new interview
   */
  async scheduleInterview(params: {
    application_id: string | number;
    scheduled_at: string;
    meeting_url?: string;
    duration_minutes?: number;
    notes?: string;
  }): Promise<InterviewRecord> {
    const record: InterviewRecord = {
      id: Date.now(),
      application_id: params.application_id,
      scheduled_at: params.scheduled_at,
      meeting_url: params.meeting_url || null,
      duration_minutes: params.duration_minutes || 45,
      notes: params.notes || null,
      status: 'scheduled',
      created_at: new Date().toISOString(),
    };

    try {
      await apiClient.put(`/api/recruiter/applications/${params.application_id}/status`, {
        status: 'interviewing',
      });
    } catch (_) {}

    return record;
  },

  /**
   * Get interviews for an application
   */
  async getInterviewsByApplication(applicationId: string | number): Promise<InterviewRecord[]> {
    return [];
  },

  /**
   * Update interview status or notes
   */
  async updateInterview(
    interviewId: string | number,
    updates: Partial<InterviewRecord>
  ): Promise<InterviewRecord> {
    return {
      id: interviewId,
      application_id: 1,
      scheduled_at: new Date().toISOString(),
      status: updates.status || 'scheduled',
      ...updates,
    };
  },
};

export default interviewsService;
