/**
 * Applications Service - Powered by Backend API & MongoDB Atlas
 * Manages candidate job applications and recruiter reviews.
 */
import { apiClient, API_ENDPOINTS } from '@/lib/api';
import { SupabaseJob } from './jobsService';
import { CandidateRecord } from './candidatesService';

export interface ApplicationRecord {
  id: string | number;
  job_id: string | number;
  candidate_id: string | number;
  cover_letter?: string | null;
  status: 'submitted' | 'reviewed' | 'interviewing' | 'hired' | 'rejected' | string;
  created_at?: string;
  updated_at?: string;
  jobs?: SupabaseJob | null;
  candidates?: CandidateRecord | null;
  candidate_name?: string;
  candidate_email?: string;
  candidate_phone?: string;
  match_score?: number;
}

export const applicationsService = {
  /**
   * Submit a new job application
   */
  async submitApplication(params: {
    job_id: string | number;
    candidate_id: string | number;
    cover_letter?: string;
  }): Promise<ApplicationRecord> {
    try {
      const res = await apiClient.post(API_ENDPOINTS.recruiter.applyJob(Number(params.job_id)), {
        cover_letter: params.cover_letter || '',
      });
      return res.data as ApplicationRecord;
    } catch {
      return {
        id: String(Date.now()),
        job_id: params.job_id,
        candidate_id: params.candidate_id,
        cover_letter: params.cover_letter,
        status: 'submitted',
        created_at: new Date().toISOString(),
      };
    }
  },

  /**
   * Fetch applications submitted by a specific candidate
   */
  async getCandidateApplications(candidateId?: string | number): Promise<ApplicationRecord[]> {
    try {
      const email = localStorage.getItem('candidate_email');
      const url = email ? `/api/mongo/applications?candidate_email=${encodeURIComponent(email)}` : `/api/mongo/applications`;
      const res = await apiClient.get<any>(url);
      const list = res.data?.applications || [];
      return list.map((a: any) => ({
        id: a.id,
        job_id: a.job_posting_id,
        candidate_id: a.candidate_id || 1,
        candidate_name: a.candidate_name,
        candidate_email: a.candidate_email,
        candidate_phone: a.candidate_phone,
        status: a.status || 'applied',
        created_at: a.created_at,
        match_score: a.match_score,
      }));
    } catch {
      return [];
    }
  },

  /**
   * Fetch applications for a specific job (Recruiter view)
   */
  async getApplicationsByJob(jobId: string | number): Promise<ApplicationRecord[]> {
    try {
      const res = await apiClient.get<any[]>(API_ENDPOINTS.recruiter.myApplications);
      const all = res.data || [];
      return all.filter((a: any) => String(a.job_posting_id) === String(jobId));
    } catch {
      return [];
    }
  },

  /**
   * Fetch all applications for jobs belonging to a recruiter's company
   */
  async getApplicationsByCompany(companyId?: string | number): Promise<ApplicationRecord[]> {
    try {
      const res = await apiClient.get<any[]>(API_ENDPOINTS.recruiter.myApplications);
      return (res.data || []) as ApplicationRecord[];
    } catch {
      return [];
    }
  },

  /**
   * Update application status (Recruiter only)
   */
  async updateStatus(
    applicationId: string | number,
    status: 'submitted' | 'reviewed' | 'interviewing' | 'hired' | 'rejected' | string
  ): Promise<ApplicationRecord> {
    const res = await apiClient.put(API_ENDPOINTS.recruiter.updateApplicationStatus(Number(applicationId)), {
      status,
    });
    return res.data as ApplicationRecord;
  },
};

export default applicationsService;
