/**
 * Practice Service for AutoAgentHire
 * Handles AI Mock Interviews, Technical Assessments, and Performance Analytics.
 */

import { apiClient, API_ENDPOINTS } from '@/lib/api';

export interface PracticeProfile {
  has_resume: boolean;
  candidate_name: string;
  email: string;
  target_designation: string;
  experience_level: string;
  skills: string[];
  projects: Array<{
    role: string;
    company: string;
    summary: string;
  }>;
  stats: {
    total_sessions: number;
    avg_score: number;
    time_spent_mins: number;
  };
}

export interface InterviewQuestion {
  id: number;
  question_index: number;
  question_type: string;
  skill: string;
  domain: string;
  difficulty: string;
  question_text: string;
  code_snippet?: string | null;
  max_marks: number;
}

export interface StartInterviewResponse {
  session_id: number;
  uuid: string;
  title: string;
  category: string;
  total_questions: number;
  current_question_index: number;
  question: InterviewQuestion;
}

export interface InterviewEvaluation {
  score: number;
  is_correct: boolean;
  evaluation: string;
  strengths: string[];
  mistakes: string[];
  missing_concepts: string[];
  suggested_improvement: string;
  better_answer_example: string;
  follow_up_question: string;
}

export interface SubmitInterviewAnswerResponse {
  evaluation: InterviewEvaluation;
  is_completed: boolean;
  answered_count: number;
  total_questions: number;
  next_question?: InterviewQuestion | null;
  summary_report?: {
    rating_tier: string;
    badge_variant: string;
    overall_percentage: number;
    total_earned: number;
    total_possible: number;
    strengths: string[];
    areas_for_improvement: string[];
    action_items: string[];
  } | null;
}

export interface TechnicalTestQuestion {
  id: number;
  question_index: number;
  question_type: 'mcq' | 'coding' | 'sql' | 'debugging' | string;
  skill: string;
  difficulty: string;
  question_text: string;
  code_snippet?: string | null;
  options?: string[] | null;
  max_marks: number;
}

export interface StartTestResponse {
  session_id: number;
  uuid: string;
  title: string;
  test_type: string;
  duration_minutes: number;
  total_questions: number;
  questions: TechnicalTestQuestion[];
}

export interface TestResultItem {
  question_id: number;
  question_index: number;
  question_text: string;
  question_type: string;
  skill: string;
  candidate_answer: string;
  correct_answer: string;
  explanation: string;
  is_correct: boolean;
  score: number;
  max_marks: number;
  evaluation: string;
  strengths: string[];
  mistakes: string[];
}

export interface SubmitTestResponse {
  status: string;
  session_id: number;
  overall_score: number;
  total_questions: number;
  summary_feedback: {
    rating_tier: string;
    badge_variant: string;
    overall_percentage: number;
    total_earned: number;
    total_possible: number;
    strengths: string[];
    areas_for_improvement: string[];
    action_items: string[];
  };
  results: TestResultItem[];
}

export interface PracticeSessionSummary {
  id: number;
  uuid: string;
  title: string;
  session_type: 'interview' | 'technical_test';
  interview_category?: string;
  test_type?: string;
  domain?: string;
  status: string;
  overall_score: number | null;
  total_questions: number;
  answered_questions: number;
  duration_minutes: number;
  time_spent_seconds: number;
  created_at: string;
  completed_at: string | null;
}

export interface PracticeAnalytics {
  total_sessions: number;
  average_score: number;
  interview_sessions: number;
  test_sessions: number;
  total_practice_minutes: number;
  skill_readiness_index: number;
  recent_scores: Array<{
    id: number;
    title: string;
    score: number;
    type: string;
    date: string;
  }>;
}

export const practiceService = {
  async getProfile(): Promise<PracticeProfile> {
    const res = await apiClient.get<PracticeProfile>(API_ENDPOINTS.practice.profile);
    return res.data;
  },

  async uploadResume(file: File): Promise<{
    status: string;
    filename: string;
    skills: string[];
    total_experience: string;
    projects: any[];
    education: any[];
    technical_domains: string[];
    suggested_designations: any[];
    summary: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.postFormData('/api/practice/upload-resume', formData);
    return res.data;
  },

  async startInterview(params: {
    category?: string;
    practice_type?: string;
    mode?: string;
    domain?: string;
    target_designation?: string;
    experience_level?: string;
    difficulty?: string;
    total_questions?: number;
    duration_minutes?: number;
    selected_skills?: string[];
  }): Promise<StartInterviewResponse> {
    const res = await apiClient.post<StartInterviewResponse>(API_ENDPOINTS.practice.startInterview, params);
    return res.data;
  },

  async submitInterviewAnswer(
    sessionId: number | string,
    params: {
      question_id: number;
      candidate_answer: string;
      time_spent_seconds?: number;
    }
  ): Promise<SubmitInterviewAnswerResponse> {
    const res = await apiClient.post<SubmitInterviewAnswerResponse>(
      API_ENDPOINTS.practice.submitInterviewAnswer(sessionId),
      params
    );
    return res.data;
  },

  async finishInterview(sessionId: number | string): Promise<any> {
    const res = await apiClient.post(API_ENDPOINTS.practice.finishInterview(sessionId));
    return res.data;
  },

  async startTechnicalTest(params: {
    test_type: string;
    domain?: string;
    difficulty?: string;
    selected_skills?: string[];
    total_questions?: number;
    duration_minutes?: number;
    mode?: string;
    practice_type?: string;
  }): Promise<StartTestResponse> {
    const res = await apiClient.post<StartTestResponse>(API_ENDPOINTS.practice.startTest, params);
    return res.data;
  },

  async saveTestAnswer(
    sessionId: number | string,
    params: {
      question_id: number;
      candidate_answer: string;
      code_language?: string;
    }
  ): Promise<any> {
    const res = await apiClient.post(API_ENDPOINTS.practice.saveTestAnswer(sessionId), params);
    return res.data;
  },

  async submitTechnicalTest(
    sessionId: number | string,
    params: {
      answers?: Array<{
        question_id: number;
        candidate_answer: string;
        code_language?: string;
      }>;
      time_spent_seconds?: number;
    }
  ): Promise<SubmitTestResponse> {
    const res = await apiClient.post<SubmitTestResponse>(
      API_ENDPOINTS.practice.submitTest(sessionId),
      params
    );
    return res.data;
  },

  async listSessions(params?: {
    session_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; sessions: PracticeSessionSummary[] }> {
    const res = await apiClient.get<{ total: number; sessions: PracticeSessionSummary[] }>(
      API_ENDPOINTS.practice.sessions,
      { params }
    );
    return res.data;
  },

  async getSessionDetail(sessionId: number | string): Promise<any> {
    const res = await apiClient.get(API_ENDPOINTS.practice.sessionDetail(sessionId));
    return res.data;
  },

  async deleteSession(sessionId: number | string): Promise<any> {
    const res = await apiClient.delete(API_ENDPOINTS.practice.deleteSession(sessionId));
    return res.data;
  },

  async getAnalytics(): Promise<PracticeAnalytics> {
    const res = await apiClient.get<PracticeAnalytics>(API_ENDPOINTS.practice.analytics);
    return res.data;
  },
};
