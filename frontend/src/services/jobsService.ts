/**
 * Jobs Service - Powered by Backend API & MongoDB Atlas
 * Manages job listings, filtering, and recruiter job publishing.
 */
import { apiClient, API_ENDPOINTS } from '@/lib/api';

export interface Company {
  id: string | number;
  name: string;
  website?: string | null;
  description?: string | null;
  owner_id?: string | null;
  created_at?: string;
}

export interface JobPosting {
  id: string | number;
  company_id?: string | number;
  title: string;
  description: string;
  location: string;
  employment_type?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_description?: string | null;
  skills?: string | null;
  status: string;
  created_at?: string;
  companies?: Company | null;
  company_name?: string | null;
  company_logo_url?: string | null;
  organization_symbol?: string | null;
  vacancies?: number | null;
  job_type?: string | null;
  recruiter_id?: number | null;
}

/** Legacy alias for backward compatibility */
export type SupabaseJob = JobPosting;
export type MongoJob = JobPosting;

export interface JobFilterParams {
  query?: string;
  location?: string;
  employment_type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export const jobsService = {
  /**
   * Fetch all active jobs (from backend & MongoDB Atlas)
   */
  async getJobs(params?: JobFilterParams): Promise<SupabaseJob[]> {
    try {
      // 1. Fetch from candidate jobs endpoint
      const resp = await apiClient.get<any[]>(API_ENDPOINTS.recruiter.candidateJobs);
      let list = resp.data || [];

      // 2. Fallback to MongoDB Atlas jobs if empty
      if (!list || list.length === 0) {
        try {
          const mongoResp = await apiClient.get<any>(API_ENDPOINTS.mongo.jobs);
          if (mongoResp.data?.jobs) {
            list = mongoResp.data.jobs;
          }
        } catch (_) {}
      }

      // Normalize format
      const formatted: SupabaseJob[] = list.map((item: any) => ({
        id: item.id || item.uuid || String(Math.random()),
        company_id: item.recruiter_id || 1,
        title: item.title || 'Software Engineer',
        description: item.description || '',
        location: item.location || 'Remote',
        employment_type: item.job_type || item.employment_type || 'Full-time',
        salary_description: item.salary_description,
        skills: item.skills,
        status: item.status || 'approved',
        created_at: item.created_at,
        company_name: item.company_name || 'AutoAgentHire Partner',
        companies: {
          id: item.recruiter_id || 1,
          name: item.company_name || 'AutoAgentHire Partner',
          website: null,
          description: null,
        },
      }));

      // Apply in-memory filters if needed
      let filtered = formatted;
      if (params?.location) {
        const loc = params.location.toLowerCase();
        filtered = filtered.filter((j) => j.location.toLowerCase().includes(loc));
      }
      if (params?.query) {
        const q = params.query.toLowerCase();
        filtered = filtered.filter(
          (j) =>
            j.title.toLowerCase().includes(q) ||
            j.description.toLowerCase().includes(q) ||
            j.company_name?.toLowerCase().includes(q) ||
            j.skills?.toLowerCase().includes(q)
        );
      }
      if (params?.limit) {
        filtered = filtered.slice(0, params.limit);
      }

      return filtered;
    } catch (err: any) {
      console.warn('Error fetching jobs from backend, checking MongoDB:', err);
      try {
        const mongoResp = await apiClient.get<any>(API_ENDPOINTS.mongo.jobs);
        const list = mongoResp.data?.jobs || [];
        return list.map((item: any) => ({
          id: item.id,
          company_id: item.recruiter_id || 1,
          title: item.title,
          description: item.description,
          location: item.location,
          employment_type: item.job_type || 'Full-time',
          salary_description: item.salary_description,
          status: item.status,
          created_at: item.created_at,
          company_name: item.company_name,
          companies: { id: 1, name: item.company_name || 'Company' },
        }));
      } catch {
        return [];
      }
    }
  },

  /**
   * Fetch single job by ID
   */
  async getJobById(jobId: string | number): Promise<SupabaseJob | null> {
    try {
      const allJobs = await this.getJobs();
      const match = allJobs.find((j) => String(j.id) === String(jobId));
      return match || null;
    } catch {
      return null;
    }
  },

  /**
   * Fetch jobs posted by a specific company
   */
  async getJobsByCompany(companyId: string | number): Promise<SupabaseJob[]> {
    try {
      const allJobs = await this.getJobs();
      return allJobs.filter((j) => String(j.company_id) === String(companyId));
    } catch {
      return [];
    }
  },

  /**
   * Create a new job listing
   */
  async createJob(jobData: {
    company_id?: string | number;
    title: string;
    description: string;
    location: string;
    employment_type?: string;
    salary_min?: number;
    salary_max?: number;
    salary_description?: string;
    status?: string;
    company_name?: string;
    vacancies?: number;
    skills?: string;
  }): Promise<SupabaseJob> {
    const payload = {
      title: jobData.title,
      description: jobData.description,
      location: jobData.location,
      job_type: jobData.employment_type || 'Full-time',
      salary_description:
        jobData.salary_description ||
        (jobData.salary_min && jobData.salary_max
          ? `$${jobData.salary_min} - $${jobData.salary_max}`
          : '$100k - $140k / yr'),
      vacancies: jobData.vacancies || 1,
      skills: jobData.skills || 'General',
      start_date_pt: new Date().toISOString(),
      final_date_pt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      company_name: jobData.company_name || 'Recruiter Company',
      status: jobData.status || 'pending_approval',
    };

    const res = await apiClient.post(API_ENDPOINTS.recruiter.createJob, payload);
    const data = res.data;
    return {
      id: data.id,
      company_id: data.recruiter_id || 1,
      title: data.title,
      description: data.description,
      location: data.location,
      employment_type: data.job_type,
      status: data.status,
      created_at: data.created_at,
      companies: { id: 1, name: data.company_name },
    };
  },

  /**
   * Update an existing job
   */
  async updateJob(jobId: string | number, updates: Partial<SupabaseJob>): Promise<SupabaseJob> {
    const res = await apiClient.put(`/api/recruiter/jobs/${jobId}`, updates);
    return res.data as SupabaseJob;
  },

  /**
   * Delete or archive a job
   */
  async deleteJob(jobId: string | number) {
    await apiClient.delete(`/api/recruiter/jobs/${jobId}`);
    return true;
  },
};

export default jobsService;
