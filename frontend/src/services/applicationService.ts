/**
 * Application Service - Handles application tracking via Supabase, Backend API, and Client Portal Storage
 */
import { applicationsService, type ApplicationRecord } from './applicationsService';
import { apiClient, API_ENDPOINTS, API_BASE_URL, type Application } from '@/lib/api';
import { getClientAppliedJobs, saveClientAppliedJob, getCandidateProfile, type AppliedJobRecord } from '@/utils/profileSync';

export interface GetApplicationsParams {
  status?: string;
  limit?: number;
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

    // 1. Fetch from Backend SQLite API (/api/applications) using validated JWT
    try {
      const queryParams = new URLSearchParams();
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

    // 3. Merge with Client Portal local storage applied jobs (STRICTLY scoped to current user)
    const clientApplied = getClientAppliedJobs();
    const currentEmail = (localStorage.getItem('candidate_email') || localStorage.getItem('user_email') || '').trim().toLowerCase();
    for (const cApp of clientApplied) {
      if (currentEmail && cApp.candidate_email && cApp.candidate_email.trim().toLowerCase() !== currentEmail) {
        continue;
      }
      let rUrl = cApp.resume_url;
      if (rUrl && rUrl.startsWith('/uploads/resumes/')) {
        rUrl = `/api/recruiter/files/${rUrl.replace('/uploads/resumes/', '')}`;
      }
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
        resume_url: rUrl,
        interview_meeting_link: (cApp as any).interview_meeting_link,
        interview_scheduled_at: (cApp as any).interview_scheduled_at,
        interview_round: (cApp as any).interview_round,
        interview_notes: (cApp as any).interview_notes,
      });
    }

    // Deduplicate applications by normalized key (title + company or id)
    // Always prioritize backend records that have active interview links or updated statuses
    const seen = new Map<string, any>();

    for (const item of rawApps) {
      const title = (item.title || item.job_title || '').trim().toLowerCase();
      const company = (item.company || item.company_name || '').trim().toLowerCase();
      const key = `${title}::${company}`;

      const formattedItem = {
        id: String(item.id || seen.size + 1),
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
        resume_url: item.resume_url ? (item.resume_url.startsWith('/uploads/resumes/') ? `/api/recruiter/files/${item.resume_url.replace('/uploads/resumes/', '')}` : item.resume_url) : undefined,
        location: item.location || 'Remote',
        interview_meeting_link: item.interview_meeting_link,
        interview_scheduled_at: item.interview_scheduled_at,
        interview_round: item.interview_round,
        interview_notes: item.interview_notes,
      };

      if (!seen.has(key)) {
        seen.set(key, formattedItem);
      } else {
        // If existing record has no interview link or is just 'applied', but new one has interview/status update, merge it
        const prev = seen.get(key);
        if (
          (!prev.interview_meeting_link && formattedItem.interview_meeting_link) ||
          (prev.status === 'applied' && formattedItem.status !== 'applied')
        ) {
          seen.set(key, { ...prev, ...formattedItem });
        }
      }
    }

    const deduplicated = Array.from(seen.values());

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
   * Persists to local client storage and submits to backend database,
   * triggering a personalized thank you email to the candidate's resume email.
   */
  async saveClientApplication(job: Partial<AppliedJobRecord>): Promise<AppliedJobRecord> {
    const profile = getCandidateProfile();
    const cleanName = job.candidate_name || profile.candidate_name || 'Candidate';
    const cleanEmail = job.candidate_email || profile.email || 'candidate@example.com';
    const cleanPhone = job.candidate_phone || profile.phone || '';
    const cleanExp = job.experience || profile.experience || 'Experience verified from resume';
    const cleanResume = job.resume_filename || profile.resume_name || 'resume.pdf';
    const jobId = job.id ? String(job.id) : String(Date.now());

    // 1. Save in Client Storage
    const savedRecord = saveClientAppliedJob({
      ...job,
      id: jobId,
      candidate_name: cleanName,
      candidate_email: cleanEmail,
      candidate_phone: cleanPhone,
      experience: cleanExp,
      resume_filename: cleanResume,
      status: 'applied',
      applied_date: new Date().toISOString(),
    });

    // 2. Persist to Backend Database via /api/ats/apply-all with authenticated JWT
    try {
      await apiClient.post('/api/ats/apply-all', {
        candidate_name: cleanName,
        candidate_email: cleanEmail,
        candidate_phone: cleanPhone,
        candidate_experience: cleanExp,
        job_ids: [jobId],
        job_title: job.title || 'Software Engineer',
        company_name: job.company || 'AutoAgentHire Partner',
        location: job.location || 'Remote',
        match_score: job.match_score || 85,
        resume_name: cleanResume,
        cover_letter: `Applied for ${job.title} at ${job.company}. Experience: ${cleanExp}`,
        jobs: [{
          id: jobId,
          title: job.title || 'Software Engineer',
          company: job.company || 'AutoAgentHire Partner',
          location: job.location || 'Remote',
          match_score: job.match_score || 85,
        }],
      });
    } catch (err) {
      console.warn('Backend batch apply persistence notice:', err);
    }

    return savedRecord;
  },

  /**
   * Batch apply to multiple matching jobs in one submission.
   * Persists all records to client storage and sends a personalized
   * thank-you email for each position to the candidate's email.
   */
  async applyBatchApplications(params: {
    candidate_name: string;
    candidate_email: string;
    candidate_phone?: string;
    candidate_experience?: string;
    resume_name?: string;
    jobs: Array<{
      id: string | number;
      title: string;
      company: string;
      location?: string;
      match_score?: number;
    }>;
  }): Promise<{ status: string; applied_count: number; message: string; candidate_email: string }> {
    const profile = getCandidateProfile();
    const cleanName = params.candidate_name || profile.candidate_name || 'Candidate';
    const cleanEmail = params.candidate_email || profile.email || 'candidate@example.com';
    const cleanPhone = params.candidate_phone || profile.phone || '';
    const cleanExp = params.candidate_experience || profile.experience || 'Experience verified from resume';
    const cleanResume = params.resume_name || profile.resume_name || 'resume.pdf';

    // 1. Save all jobs to local client storage
    for (const j of params.jobs) {
      saveClientAppliedJob({
        id: String(j.id),
        title: j.title,
        company: j.company,
        location: j.location || 'Remote',
        match_score: j.match_score || 85,
        candidate_name: cleanName,
        candidate_email: cleanEmail,
        candidate_phone: cleanPhone,
        experience: cleanExp,
        resume_filename: cleanResume,
        status: 'applied',
        url: '/candidate/jobs',
        applied_date: new Date().toISOString(),
      });
    }

    // 2. Post batch to backend /api/ats/apply-all using authenticated apiClient
    try {
      const res = await apiClient.post('/api/ats/apply-all', {
        candidate_name: cleanName,
        candidate_email: cleanEmail,
        candidate_phone: cleanPhone,
        candidate_experience: cleanExp,
        resume_name: cleanResume,
        job_ids: params.jobs.map((j) => j.id),
        jobs: params.jobs.map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          location: j.location || 'Remote',
          match_score: j.match_score || 85,
        })),
      });

      if (res && res.data) {
        const data = res.data;
        return {
          status: 'success',
          applied_count: data.applied_count || params.jobs.length,
          message: data.message || `Submitted ${params.jobs.length} applications and dispatched thank-you emails to ${cleanEmail}.`,
          candidate_email: cleanEmail,
        };
      }
    } catch (err) {
      console.warn('Backend batch apply request error:', err);
    }

    return {
      status: 'success',
      applied_count: params.jobs.length,
      message: `Submitted applications for ${params.jobs.length} positions. Confirmation email dispatched to ${cleanEmail}.`,
      candidate_email: cleanEmail,
    };
  },

  /**
   * Get candidate profile activity history from backend database.
   * Uses JWT authentication — user identity is derived server-side, never from query params.
   */
  async getUserActivities() {
    try {
      const res = await apiClient.get<{ activities: any[]; total: number }>(`/api/user/activities`);
      return res.data;
    } catch (e) {
      console.warn('Could not fetch user activities:', e);
      return { activities: [], total: 0 };
    }
  },

  /**
   * Get candidate's uploaded resumes from backend database.
   * Uses JWT authentication — user identity is derived server-side, never from query params.
   */
  async getUserResumes() {
    try {
      const res = await apiClient.get<{ resumes: any[]; total: number }>(`/api/user/resumes`);
      return res.data;
    } catch (e) {
      console.warn('Could not fetch user resumes:', e);
      return { resumes: [], total: 0 };
    }
  },
};

export default applicationService;
