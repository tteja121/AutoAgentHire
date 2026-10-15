/**
 * Job Service - Handles job search and automation via Backend API and MongoDB Atlas
 */
import { jobsService, type JobPosting } from './jobsService';
import { apiClient, API_ENDPOINTS, type Job, type AgentStatus } from '@/lib/api';

export interface SearchJobsRequest {
  keywords: string;
  location: string;
  maxResults?: number;
}

export interface RunAgentRequest {
  file?: File;
  keyword: string;
  location: string;
  skills?: string;
  experience_level?: string;
  job_type?: string;
  salary_range?: string;
  max_jobs?: number;
  max_applications?: number;
  similarity_threshold?: number;
  auto_apply?: boolean;
}

export const jobService = {
  /**
   * Search for jobs from MongoDB Atlas & Backend API
   */
  async searchJobs(params: SearchJobsRequest): Promise<{ jobs: Job[]; count: number }> {
    try {
      const dbJobs = await jobsService.getJobs({
        query: params.keywords,
        location: params.location,
        limit: params.maxResults || 20,
      });

      const formatted: Job[] = dbJobs.map(j => ({
        id: String(j.id),
        title: j.title,
        company: j.companies?.name || 'AutoAgentHire Partner',
        location: j.location,
        description: j.description,
        status: j.status,
      }));

      return { jobs: formatted, count: formatted.length };
    } catch (err) {
      console.warn('Fallback search via API client:', err);
      const queryParams = new URLSearchParams({
        keywords: params.keywords,
        location: params.location,
        max_results: String(params.maxResults || 20),
      });
      const res = await apiClient.get<{ jobs: Job[]; count: number }>(`${API_ENDPOINTS.searchJobs}?${queryParams}`);
      return res.data;
    }
  },

  /**
   * Start the automated job application agent
   */
  async runAgent(request: RunAgentRequest): Promise<{ status: string; message: string; data: any }> {
    const formData = new FormData();
    if (request.file) {
      formData.append('file', request.file);
    }
    formData.append('keyword', request.keyword);
    formData.append('location', request.location);
    formData.append('skills', (request.skills || 'N/A').trim() || 'N/A');
    formData.append('experience_level', request.experience_level || 'Any');
    formData.append('job_type', request.job_type || 'Any');
    formData.append('salary_range', request.salary_range || 'Any');
    formData.append('max_jobs', String(request.max_jobs || 15));
    formData.append('max_applications', String(request.max_applications || 5));
    formData.append('similarity_threshold', String(request.similarity_threshold || 0.6));
    formData.append('auto_apply', (request.auto_apply !== false) ? 'true' : 'false');

    const res = await apiClient.postFormData<{ status: string; message: string; data: any }>('/api/run-agent', formData);
    return res.data;
  },

  /**
   * Get current agent status
   */
  async getAgentStatus(): Promise<AgentStatus> {
    const res = await apiClient.get<AgentStatus>(API_ENDPOINTS.agentStatus);
    return res.data;
  },

  /**
   * Pause the running agent
   */
  async pauseAgent(): Promise<{ status: string }> {
    const res = await apiClient.post<{ status: string }>(API_ENDPOINTS.pauseAgent);
    return res.data;
  },

  /**
   * Resume a paused agent
   */
  async resumeAgent(): Promise<{ status: string }> {
    const res = await apiClient.post<{ status: string }>(API_ENDPOINTS.resumeAgent);
    return res.data;
  },

  /**
   * Stop the running agent
   */
  async stopAgent(): Promise<{ status: string }> {
    const res = await apiClient.post<{ status: string }>(API_ENDPOINTS.stopAgent);
    return res.data;
  },
};

export default jobService;
