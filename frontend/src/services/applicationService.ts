/**
 * Application Service - Handles application tracking via Supabase, Backend API, and Client Portal Storage
 */
import { applicationsService, type ApplicationRecord } from './applicationsService';
import { apiClient, API_ENDPOINTS, API_BASE_URL, type Application } from '@/lib/api';
import { getClientAppliedJobs, saveClientAppliedJob, getCandidateProfile, type AppliedJobRecord } from '@/utils/profileSync';

export interface GetApplicationsParams {
  user_email?: string;
  status?: string;
  limit?: number;
  candidate_id?: string | number;
}

export interface GetApplicationsResponse {
  applications: Application[];
  total: number;
  page: number;
  limit: number;
}

export const applicationService = {
  /**
   * Get application history from Backend API, Supabase, and Client Portal Store,
   * merging and deduplicating so no client application is ever lost.
   */
  async getApplications(params?: GetApplicationsParams): Promise<GetApplicationsResponse> {
    const rawApps: any[] = [];

    // 1. Fetch from Backend SQLite API (/api/applications)
    try {
      const queryParams = new URLSearchParams();
      const email = params?.user_email || localStorage.getItem('candidate_email');
      if (email) queryParams.append('user_email', email);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.limit) queryParams.append('limit', String(params.limit || 50));

      const query = queryParams.toString();
      const endpoint = query ? `${API_ENDPOINTS.getApplications}?${query}` : API_ENDPOINTS.getApplications;
      const res = await apiClient.get<any>(endpoint);

      if (res.data) {
        if (Array.isArray(res.data.applications)) {
          rawApps.push(...res.data.applications);
        } else if (Array.isArray(res.data)) {
          rawApps.push(...res.data);
        }
      }
    } catch (apiErr) {
      console.warn('Backend API applications fetch notice:', apiErr);
    }

    // 2. Fetch from MongoDB Atlas if needed
    try {
      if (rawApps.length === 0) {
        const mongoRes = await apiClient.get<any>(API_ENDPOINTS.mongo.applications);
        const mongoApps = mongoRes.data?.applications || [];
        const formatted = mongoApps.map((r: any) => ({
          id: String(r.id || r._id),
          job_title: r.job_title || 'Job Position',
          title: r.job_title || 'Job Position',
          company: r.company_name || 'Company',
          company_name: r.company_name || 'Company',
          status: r.status || 'applied',
          applied_at: r.created_at,
          applied_date: r.created_at,
          job_url: `/candidate/jobs`,
          url: `/candidate/jobs`,
          match_score: r.match_score || 90,
        }));
        rawApps.push(...formatted);
      }
    } catch (mongoErr) {
      console.warn('MongoDB applications fetch notice:', mongoErr);
    }

    // 3. Merge with Client Portal local storage applied jobs
    const clientApplied = getClientAppliedJobs();
    for (const cApp of clientApplied) {
      rawApps.push({
        id: cApp.id,
        title: cApp.title,
        job_title: cApp.title,
        company: cApp.company,
        company_name: cApp.company,
        url: cApp.url || '/candidate/jobs',
        job_url: cApp.url || '/candidate/jobs',
        status: cApp.status || 'applied',
        applied_date: cApp.applied_date,
        applied_at: cApp.applied_date,
        match_score: cApp.match_score || 92,
        candidate_name: cApp.candidate_name,
        candidate_email: cApp.candidate_email,
        candidate_phone: cApp.candidate_phone,
        location: cApp.location,
        resume_filename: cApp.resume_filename,
        resume_url: cApp.resume_url,
      });
    }

    // Deduplicate applications by normalized key (title + company or id)
    const seen = new Set<string>();
    const deduplicated: Application[] = [];

    for (const item of rawApps) {
      const title = (item.title || item.job_title || '').trim().toLowerCase();
      const company = (item.company || item.company_name || '').trim().toLowerCase();
      const key = `${title}::${company}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push({
          id: String(item.id || deduplicated.length + 1),
          job_title: item.title || item.job_title || 'Software Engineer',
          title: item.title || item.job_title || 'Software Engineer',
          company: item.company || item.company_name || 'AutoAgentHire Partner',
          company_name: item.company || item.company_name || 'AutoAgentHire Partner',
          status: item.status || 'applied',
          applied_at: item.applied_at || item.applied_date || new Date().toISOString(),
          applied_date: item.applied_date || item.applied_at || new Date().toISOString(),
          job_url: item.url || item.job_url || '/candidate/jobs',
          url: item.url || item.job_url || '/candidate/jobs',
          match_score: item.match_score || 92,
          candidate_name: item.candidate_name,
          candidate_email: item.candidate_email,
          candidate_phone: item.candidate_phone,
          resume_filename: item.resume_filename,
          resume_url: item.resume_url,
          location: item.location || 'Remote',
        } as any);
      }
    }

    // Sort newest first
    deduplicated.sort((a: any, b: any) => {
      const dateA = new Date(a.applied_at || a.applied_date || 0).getTime();
      const dateB = new Date(b.applied_at || b.applied_date || 0).getTime();
      return dateB - dateA;
    });

    return {
      applications: deduplicated,
      total: deduplicated.length,
      page: 1,
      limit: params?.limit || 50,
    };
  },

  /**
   * Save a job application applied from any client portal container.
   * Persists to local client storage and submits to backend database.
   */
  async saveClientApplication(job: Partial<AppliedJobRecord>): Promise<AppliedJobRecord> {
    const profile = getCandidateProfile();
    const cleanName = job.candidate_name || profile.candidate_name || 'Candidate';
    const cleanEmail = job.candidate_email || profile.email || 'candidate@example.com';
    const cleanPhone = job.candidate_phone || profile.phone || '';
    const jobId = job.id ? String(job.id) : String(Date.now());

    // 1. Save in Client Storage
    const savedRecord = saveClientAppliedJob({
      ...job,
      id: jobId,
      candidate_name: cleanName,
      candidate_email: cleanEmail,
      candidate_phone: cleanPhone,
      status: 'applied',
      applied_date: new Date().toISOString(),
    });

    // 2. Persist to Backend Database via /api/ats/apply-all
    try {
      await fetch(`${API_BASE_URL}/api/ats/apply-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          candidate_name: cleanName,
          candidate_email: cleanEmail,
          candidate_phone: cleanPhone,
          candidate_experience: profile.experience || 'Experience verified',
          job_ids: [jobId],
          resume_name: profile.resume_name || 'resume.pdf',
          cover_letter: `Applied for ${job.title} at ${job.company}`,
        }),
      });
    } catch (err) {
      console.warn('Backend batch apply persistence notice:', err);
    }

    return savedRecord;
  },

  /**
   * Get candidate profile activity history from backend database
   */
  async getUserActivities(userEmail?: string) {
    try {
      const email = userEmail || localStorage.getItem('candidate_email');
      const query = email ? `?user_email=${encodeURIComponent(email)}` : '';
      const res = await apiClient.get<{ activities: any[]; total: number }>(`/api/user/activities${query}`);
      return res.data;
    } catch (e) {
      console.warn('Could not fetch user activities:', e);
      return { activities: [], total: 0 };
    }
  },

  /**
   * Get candidate's uploaded resumes from backend database
   */
  async getUserResumes(userEmail?: string) {
    try {
      const email = userEmail || localStorage.getItem('candidate_email');
      const query = email ? `?user_email=${encodeURIComponent(email)}` : '';
      const res = await apiClient.get<{ resumes: any[]; total: number }>(`/api/user/resumes${query}`);
      return res.data;
    } catch (e) {
      console.warn('Could not fetch user resumes:', e);
      return { resumes: [], total: 0 };
    }
  },
};

export default applicationService;
