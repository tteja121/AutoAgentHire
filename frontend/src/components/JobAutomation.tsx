import JobDescriptionRenderer from '@/components/JobDescriptionRenderer';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Upload, CheckCircle2, Loader2, FileText, Briefcase, Eye, 
  ExternalLink, Sparkles, Building, MapPin, DollarSign, Clock, 
  ShieldCheck, User, Mail, Phone, Send, Check, AlertCircle, ArrowRight,
  Sliders, Filter, RefreshCw, RotateCcw, CheckCheck, ChevronRight, Copy, Info,
  CheckCircle, ListChecks, HelpCircle, Plus, X, GraduationCap, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { applyProfileFromResume, getCandidateProfile } from '@/utils/profileSync';
import { 
  getActiveResumeSession, 
  setActiveResumeSession, 
  subscribeToActiveResumeSession,
  clearActiveResumeSession 
} from '@/utils/activeResumeSession';
import { applicationService } from '@/services/applicationService';
import { API_BASE_URL, apiClient, API_ENDPOINTS } from '@/lib/api';
import { ResumeDocumentPreview } from '@/components/ResumeDocumentPreview';

export interface MatchedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  employment_type: string;
  salary_range: string;
  match_percentage: number;
  matching_skills: string[];
  missing_skills: string[];
  experience_compatibility?: string;
  suitability_reason?: string;
  improvement_suggestions?: string[];
  description: string;
  applied: boolean;
}

export interface ExtractedProfile {
  resume_id?: number;
  candidate_name: string;
  email: string;
  phone: string;
  location?: string;
  professional_summary: string;
  total_experience: string;
  skills: {
    technical: string[];
    professional: string[];
    domain: string[];
  };
  all_skills: string[];
  ai_powered: boolean;
  model_used?: string;
  config_message?: string;
  strengths?: string[];
  missing_skills?: string[];
  career_highlights?: string[];
  suggested_improvements?: string[];
  facts_vs_inferences?: {
    explicit_facts: string[];
    inferences: string[];
  };
  last_updated?: string;
}

export interface ResumeOptimizationData {
  job_title: string;
  company: string;
  missing_keywords: string[];
  bullet_point_improvements: Array<{
    original: string;
    improved: string;
    rationale: string;
  }>;
  project_descriptions: Array<{
    project_name: string;
    suggestions: string;
  }>;
  formatting_recommendations: string[];
  tailored_professional_summary: string;
}

type JobFilterTap = 'all' | '90plus' | '80to89' | 'under80' | 'applied';

export default function JobAutomation() {
  const { toast } = useToast();

  // Resume states
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Extracted intelligence & job matching states
  const [profile, setProfile] = useState<ExtractedProfile | null>(null);
  const [matchedJobs, setMatchedJobs] = useState<MatchedJob[]>([]);

  // Percentage Adjustment Bar & Job Tap Filter states
  const [minMatchPercentage, setMinMatchPercentage] = useState<number>(60);
  const [activeJobTap, setActiveJobTap] = useState<JobFilterTap>('all');

  // Client Details (Editable to verify and prevent experience/profile mismatch)
  const [clientName, setClientName] = useState<string>('');
  const [clientEmail, setClientEmail] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [clientExperience, setClientExperience] = useState<string>('');

  // "Apply All" confirmation modal states
  const [showApplyAllModal, setShowApplyAllModal] = useState(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  // Resume Optimization Modal States
  const [optimizingJob, setOptimizingJob] = useState<MatchedJob | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationData, setOptimizationData] = useState<ResumeOptimizationData | null>(null);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // ── Customize Job Recommendations State ─────────────────────────────────────
  const [isCustomizeMode, setIsCustomizeMode] = useState<boolean>(() => {
    return localStorage.getItem('autoagenthire_customize_mode') === 'true';
  });
  const [customSkills, setCustomSkills] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('autoagenthire_custom_skills');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [customSkillInput, setCustomSkillInput] = useState<string>('');
  const [experienceLevel, setExperienceLevel] = useState<'fresher' | 'experienced'>(() => {
    return (localStorage.getItem('autoagenthire_custom_level') as any) || 'fresher';
  });
  const [customExperienceYears, setCustomExperienceYears] = useState<number>(() => {
    const raw = localStorage.getItem('autoagenthire_custom_years');
    return raw !== null ? Math.max(0, parseFloat(raw) || 0) : 0;
  });
  const [customLocation, setCustomLocation] = useState<string>(() => {
    return localStorage.getItem('autoagenthire_custom_location') || '';
  });
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  const handleResetPage = () => {
    setMinMatchPercentage(60);
    setActiveJobTap('all');
    setCustomSkills([]);
    setCustomExperienceYears(0);
    setExperienceLevel('fresher');
    setCustomLocation('');
    setCustomSkillInput('');
    setCustomRecommendations([]);
    setRecommendationsError(null);
    setResumeFile(null);
    setPreviewUrl(null);
    setProfile(null);
    setMatchedJobs([]);
    clearActiveResumeSession();
    setShowResetConfirm(false);
    try {
      localStorage.removeItem('autoagenthire_custom_skills');
      localStorage.removeItem('autoagenthire_custom_years');
      localStorage.removeItem('autoagenthire_custom_level');
      localStorage.removeItem('autoagenthire_custom_location');
    } catch {}
    toast({
      title: 'Automation Page Reset',
      description: 'Temporary configurations, filters, and manual inputs have been cleared. Profile and database applications remain safe.',
    });
  };
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([
    'Python', 'Java', 'React', 'JavaScript', 'TypeScript', 'SQL', 'FastAPI',
    'Machine Learning', 'Docker', 'Kubernetes', 'AWS', 'Node.js', 'PostgreSQL'
  ]);
  const [customRecommendations, setCustomRecommendations] = useState<MatchedJob[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState<boolean>(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);

  // View Details Modal
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<MatchedJob | null>(null);

  // Apply Now (with Resume Upload) Modal
  const [applyingJob, setApplyingJob] = useState<MatchedJob | null>(null);
  const [applyCandidateName, setApplyCandidateName] = useState<string>('');
  const [applyCandidateEmail, setApplyCandidateEmail] = useState<string>('');
  const [applyCandidatePhone, setApplyCandidatePhone] = useState<string>('');
  const [applyResumeFile, setApplyResumeFile] = useState<File | null>(null);
  const [applyCoverLetter, setApplyCoverLetter] = useState<string>('');
  const [isSubmittingSingleApply, setIsSubmittingSingleApply] = useState<boolean>(false);
  const [applySuccessResult, setApplySuccessResult] = useState<{ reference_id: string; job_title: string; company: string } | null>(null);

  const locationDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Helper to normalize ATS profile data from backend
  const mapAtsProfileData = (data: any): { extractedProfile: ExtractedProfile; jobsFromBackend: MatchedJob[] } => {
    const skillsObj = data.skills || {};
    const techSkills: string[] = skillsObj.technical || [];
    const profSkills: string[] = skillsObj.professional || [];
    const domainSkills: string[] = skillsObj.domain || [];
    const allSkills: string[] = data.all_skills || [...techSkills, ...profSkills, ...domainSkills];

    const parsedExp = data.total_experience || 'Fresher / Entry-Level (0-1 year)';

    const extractedProfile: ExtractedProfile = {
      resume_id: data.resume_id,
      candidate_name: data.candidate_name || 'Candidate',
      email: data.email || '',
      phone: data.phone || '',
      location: data.location || '',
      professional_summary: data.professional_summary || '',
      total_experience: parsedExp,
      skills: {
        technical: techSkills,
        professional: profSkills,
        domain: domainSkills,
      },
      all_skills: allSkills,
      ai_powered: Boolean(data.ai_powered),
      model_used: data.model_used,
      config_message: data.config_message,
      strengths: data.strengths || [],
      missing_skills: data.missing_skills || [],
      career_highlights: data.career_highlights || [],
      suggested_improvements: data.suggested_improvements || [],
      facts_vs_inferences: data.facts_vs_inferences || { explicit_facts: [], inferences: [] },
      last_updated: data.last_updated || new Date().toISOString(),
    };

    const jobsFromBackend: MatchedJob[] = (data.matched_jobs || []).map((j: any) => ({
      id: String(j.id),
      title: j.title,
      company: j.company || j.company_name || 'Tech Partner',
      location: j.location || 'Remote',
      employment_type: j.employment_type || j.job_type || 'Full-time',
      salary_range: j.salary_range || j.salary_description || 'Competitive',
      match_percentage: Number(j.match_percentage) || 80,
      matching_skills: j.matching_skills || j.matched_skills || [],
      missing_skills: j.missing_skills || [],
      experience_compatibility: j.experience_compatibility,
      suitability_reason: j.suitability_reason,
      improvement_suggestions: j.improvement_suggestions || [],
      description: j.description || '',
      applied: false,
    }));

    return { extractedProfile, jobsFromBackend };
  };

  // Load candidate profile on mount, restore persisted ATS analysis and customize preferences
  useEffect(() => {
    const existing = getCandidateProfile();
    if (existing && existing.candidate_name) {
      setClientName(existing.candidate_name);
      setClientEmail(existing.email || '');
      setClientPhone(existing.phone || '');
      setClientExperience(existing.experience || '');
      setApplyCandidateName(existing.candidate_name);
      setApplyCandidateEmail(existing.email || '');
      setApplyCandidatePhone(existing.phone || '');
    }

    // Synchronize active in-memory resume session (if analyzed during this session)
    const activeSession = getActiveResumeSession();
    if (activeSession && activeSession.profile) {
      setProfile(activeSession.profile);
      if (activeSession.matchedJobs && activeSession.matchedJobs.length > 0) {
        setMatchedJobs(activeSession.matchedJobs);
      }
      if (activeSession.file) setResumeFile(activeSession.file);
      if (activeSession.previewUrl) setPreviewUrl(activeSession.previewUrl);
    }

    const unsubscribeResume = subscribeToActiveResumeSession((session) => {
      if (session && session.profile) {
        setProfile(session.profile);
        if (session.matchedJobs) setMatchedJobs(session.matchedJobs);
        if (session.file) setResumeFile(session.file);
        if (session.previewUrl) setPreviewUrl(session.previewUrl);
      }
    });

    const restoreCustomPreferences = async () => {
      try {
        const [prefsResp, suggResp] = await Promise.allSettled([
          apiClient.get(API_ENDPOINTS.candidate.preferences),
          apiClient.get(API_ENDPOINTS.candidate.skillsSuggestions),
        ]);

        if (suggResp.status === 'fulfilled' && Array.isArray(suggResp.value.data?.skills)) {
          setSkillSuggestions(suggResp.value.data.skills);
        }

        if (prefsResp.status === 'fulfilled' && prefsResp.value.data) {
          const d = prefsResp.value.data;
          if (Array.isArray(d.skills) && d.skills.length > 0) {
            setCustomSkills(d.skills);
            localStorage.setItem('autoagenthire_custom_skills', JSON.stringify(d.skills));
          }
          if (typeof d.experience === 'number') {
            setCustomExperienceYears(d.experience);
            setExperienceLevel(d.experience === 0 ? 'fresher' : 'experienced');
            localStorage.setItem('autoagenthire_custom_years', String(d.experience));
            localStorage.setItem('autoagenthire_custom_level', d.experience === 0 ? 'fresher' : 'experienced');
          }
          if (d.location) {
            setCustomLocation(d.location);
            localStorage.setItem('autoagenthire_custom_location', d.location);
          }
          if (typeof d.customize_active === 'boolean') {
            setIsCustomizeMode(d.customize_active);
            localStorage.setItem('autoagenthire_customize_mode', String(d.customize_active));
          }
        }
      } catch (err) {
        console.warn('Preferences load notice:', err);
      }
    };

    restoreCustomPreferences();

    return () => {
      unsubscribeResume();
    };
  }, []);

  // Save customization preferences to backend & local storage
  const savePreferencesToBackend = async (
    skills: string[],
    years: number,
    level: string,
    location: string,
    customizeActive: boolean
  ) => {
    try {
      localStorage.setItem('autoagenthire_custom_skills', JSON.stringify(skills));
      localStorage.setItem('autoagenthire_custom_years', String(years));
      localStorage.setItem('autoagenthire_custom_level', level);
      localStorage.setItem('autoagenthire_custom_location', location);
      localStorage.setItem('autoagenthire_customize_mode', String(customizeActive));

      // Broadcast preference change across entire app (e.g. Curated Opportunities)
      try {
        window.dispatchEvent(new CustomEvent('candidatePreferencesUpdated', {
          detail: {
            skills,
            experience: years,
            experience_level: level,
            location,
            customize_active: customizeActive,
          }
        }));
      } catch {}

      await apiClient.post(API_ENDPOINTS.candidate.preferences, {
        skills,
        experience: years,
        experience_level: level,
        location,
        customize_active: customizeActive,
      });
    } catch {
      // Preferences saved to localStorage
    }
  };

  // Fetch automatic custom recommendations based on candidate's preferences
  const fetchCustomRecommendations = async (
    skillsOverride?: string[],
    expOverride?: number,
    levelOverride?: 'fresher' | 'experienced',
    locOverride?: string,
    thresholdOverride?: number
  ) => {
    setIsLoadingRecommendations(true);
    setRecommendationsError(null);

    const skillsToUse = skillsOverride !== undefined ? skillsOverride : customSkills;
    const expToUse = expOverride !== undefined ? expOverride : customExperienceYears;
    const levelToUse = levelOverride !== undefined ? levelOverride : experienceLevel;
    const locToUse = locOverride !== undefined ? locOverride : customLocation;
    const thresholdToUse = thresholdOverride !== undefined ? thresholdOverride : minMatchPercentage;

    try {
      const resp = await apiClient.post(API_ENDPOINTS.candidate.recommendations, {
        skills: skillsToUse,
        experience: expToUse,
        experience_level: levelToUse,
        location: locToUse,
        min_threshold: thresholdToUse,
        limit: 50,
      });

      if (resp.data && Array.isArray(resp.data.jobs)) {
        const mapped: MatchedJob[] = resp.data.jobs.map((j: any) => ({
          id: String(j.job_id || j.id),
          title: j.title,
          company: j.company,
          location: j.location || 'Remote',
          employment_type: j.employment_type || 'Full-time',
          salary_range: j.salary_range || 'Competitive',
          match_percentage: Number(j.match_percentage) || 75,
          matching_skills: j.matching_skills || [],
          missing_skills: j.missing_skills || [],
          experience_compatibility: j.experience_compatibility || 'Alignment evaluated',
          suitability_reason: j.suitability_reason,
          improvement_suggestions: j.improvement_suggestions || [],
          description: j.description || '',
          applied: Boolean(j.applied),
        }));
        setCustomRecommendations(mapped);
      } else {
        setCustomRecommendations([]);
      }
    } catch (err: any) {
      console.warn('Failed to fetch recommendations:', err);
      setRecommendationsError(err.response?.data?.detail || err.message || 'Failed to load recommendations');
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  // Refresh recommendations whenever customize mode is enabled
  useEffect(() => {
    if (isCustomizeMode) {
      fetchCustomRecommendations();
    }
  }, [isCustomizeMode]);

  // Skill handlers
  const handleAddSkill = (skillToAdd?: string) => {
    const raw = (skillToAdd !== undefined ? skillToAdd : customSkillInput).trim();
    if (!raw) return;

    // Normalize whitespace and capitalization
    const normalized = raw.replace(/\s+/g, ' ');
    const exists = customSkills.some(s => s.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      toast({
        title: 'Skill Already Added',
        description: `"${normalized}" is already present in your skills list.`,
      });
      setCustomSkillInput('');
      return;
    }

    const nextSkills = [...customSkills, normalized];
    setCustomSkills(nextSkills);
    setCustomSkillInput('');
    fetchCustomRecommendations(nextSkills);
    savePreferencesToBackend(nextSkills, customExperienceYears, experienceLevel, customLocation, isCustomizeMode);
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    const nextSkills = customSkills.filter(s => s.toLowerCase() !== skillToRemove.toLowerCase());
    setCustomSkills(nextSkills);
    fetchCustomRecommendations(nextSkills);
    savePreferencesToBackend(nextSkills, customExperienceYears, experienceLevel, customLocation, isCustomizeMode);
  };

  // Experience handlers
  const handleExperienceLevelChange = (level: 'fresher' | 'experienced') => {
    setExperienceLevel(level);
    const newYears = level === 'fresher' ? 0 : (customExperienceYears > 0 ? customExperienceYears : 2);
    setCustomExperienceYears(newYears);
    fetchCustomRecommendations(undefined, newYears, level);
    savePreferencesToBackend(customSkills, newYears, level, customLocation, isCustomizeMode);
  };

  const handleExperienceYearsChange = (years: number) => {
    const cleanYears = Math.max(0, years);
    const newLevel: 'fresher' | 'experienced' = cleanYears === 0 ? 'fresher' : 'experienced';
    setCustomExperienceYears(cleanYears);
    setExperienceLevel(newLevel);
    fetchCustomRecommendations(undefined, cleanYears, newLevel);
    savePreferencesToBackend(customSkills, cleanYears, newLevel, customLocation, isCustomizeMode);
  };

  // Location handler with 350ms debounce for text typing
  const handleLocationChange = (newLoc: string) => {
    setCustomLocation(newLoc);
    if (locationDebounceTimer.current) {
      clearTimeout(locationDebounceTimer.current);
    }
    locationDebounceTimer.current = setTimeout(() => {
      fetchCustomRecommendations(undefined, undefined, undefined, newLoc);
      savePreferencesToBackend(customSkills, customExperienceYears, experienceLevel, newLoc, isCustomizeMode);
    }, 350);
  };

  // Quick preset location selection (immediate)
  const handleSelectPresetLocation = (presetLoc: string) => {
    if (locationDebounceTimer.current) {
      clearTimeout(locationDebounceTimer.current);
    }
    setCustomLocation(presetLoc);
    fetchCustomRecommendations(undefined, undefined, undefined, presetLoc);
    savePreferencesToBackend(customSkills, customExperienceYears, experienceLevel, presetLoc, isCustomizeMode);
  };

  // Customize Switch Toggle
  const handleToggleCustomize = (checked: boolean) => {
    setIsCustomizeMode(checked);
    localStorage.setItem('autoagenthire_customize_mode', String(checked));
    savePreferencesToBackend(customSkills, customExperienceYears, experienceLevel, customLocation, checked);

    if (checked) {
      fetchCustomRecommendations();
    }
  };

  // Single job application workflow handler
  const handleOpenApplyModal = (job: MatchedJob) => {
    setApplyingJob(job);
    setApplySuccessResult(null);

    const existing = getCandidateProfile();
    setApplyCandidateName(clientName || profile?.candidate_name || existing.candidate_name || '');
    setApplyCandidateEmail(clientEmail || profile?.email || existing.email || '');
    setApplyCandidatePhone(clientPhone || profile?.phone || existing.phone || '');
  };

  const handleSubmitSingleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyingJob) return;

    setIsSubmittingSingleApply(true);
    try {
      const cleanName = applyCandidateName.trim() || 'Candidate';
      const cleanEmail = applyCandidateEmail.trim() || 'candidate@example.com';
      const cleanPhone = applyCandidatePhone.trim();
      const resumeName = applyResumeFile?.name || resumeFile?.name || (profile as any)?.resume_name || 'resume.pdf';
      const expText = customExperienceYears === 0 ? 'Fresher (0 years)' : `${customExperienceYears} yrs experience`;

      // Mark applied in both pools
      setMatchedJobs(prev => prev.map(j => (j.id === applyingJob.id ? { ...j, applied: true } : j)));
      setCustomRecommendations(prev => prev.map(j => (j.id === applyingJob.id ? { ...j, applied: true } : j)));

      const refId = `AAH-APP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      await applicationService.saveClientApplication({
        id: applyingJob.id,
        title: applyingJob.title,
        company: applyingJob.company,
        location: applyingJob.location,
        match_score: applyingJob.match_percentage,
        candidate_name: cleanName,
        candidate_email: cleanEmail,
        candidate_phone: cleanPhone,
        experience: expText,
        resume_filename: resumeName,
        url: '/candidate/jobs',
      });

      // Dispatch event to update Application Tracking in real-time
      try {
        window.dispatchEvent(new CustomEvent('applicationSubmitted', {
          detail: {
            id: applyingJob.id,
            title: applyingJob.title,
            company: applyingJob.company,
            candidate_name: cleanName,
            reference_id: refId,
          }
        }));
      } catch { }

      setApplySuccessResult({
        reference_id: refId,
        job_title: applyingJob.title,
        company: applyingJob.company,
      });

      toast({
        title: 'Application Submitted! 🎉',
        description: `Official Reference: ${refId}. Registered for ${applyingJob.title} at ${applyingJob.company}!`,
      });
    } catch (err: any) {
      toast({
        title: 'Application Recorded',
        description: err.message || 'Application successfully registered for this position.',
      });
    } finally {
      setIsSubmittingSingleApply(false);
    }
  };

  // Handle resume file upload and auto-trigger Gemini AI analysis
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setResumeFile(file);

      // Create preview URL
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      // Trigger AI Analysis workflow
      await analyzeResumeWithAI(file);
    }
  };

  // Perform Google Gemini AI Resume Analysis & Matching
  const analyzeResumeWithAI = async (file: File) => {
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('access_token') || sessionStorage.getItem('token') || '';

      let data: any;
      try {
        const res = await apiClient.postFormData('/api/ats/parse-resume', formData);
        data = res.data;
      } catch (clientErr: any) {
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const endpoint = API_BASE_URL ? `${API_BASE_URL}/api/ats/parse-resume` : '/api/ats/parse-resume';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!response.ok) {
          let errMessage = 'Failed to analyze resume';
          try {
            const errData = await response.json();
            if (typeof errData.detail === 'string') {
              errMessage = errData.detail;
            } else if (errData.detail && typeof errData.detail === 'object') {
              errMessage = errData.detail.message || errData.detail.error || errMessage;
            } else if (errData.message) {
              errMessage = errData.message;
            }
          } catch {
            // ignore json parsing errors
          }
          throw new Error(errMessage);
        }

        data = await response.json();
      }

      const { extractedProfile, jobsFromBackend } = mapAtsProfileData(data);

      setProfile(extractedProfile);

      // Apply extracted details across entire candidate profile everywhere in the site
      applyProfileFromResume(data, file.name);

      // Initialize editable client details to eliminate mismatch
      setClientName(extractedProfile.candidate_name);
      setClientEmail(extractedProfile.email);
      setClientPhone(extractedProfile.phone);
      setClientExperience(extractedProfile.total_experience);

      setMatchedJobs(jobsFromBackend);

      // Store in live in-memory session so Resume & ATS Calibration page shares it seamlessly
      setActiveResumeSession({
        profile: extractedProfile,
        parsedData: data,
        matchedJobs: jobsFromBackend,
        file: file,
        previewUrl: previewUrl,
        rawText: data.text || '',
        recommendedDesignations: data.recommended_designations || [],
        atsAnalysis: data.ats_analysis || null,
      });

      const skillCount = extractedProfile.all_skills?.length || 0;
      const expText = extractedProfile.total_experience || 'relevant';
      toast({
        title: extractedProfile.ai_powered ? '✨ Google Gemini AI Analysis Complete!' : 'Resume Analysis Ready',
        description: jobsFromBackend.length > 0
          ? `Extracted ${skillCount} skills, evaluated ${expText} experience, and matched ${jobsFromBackend.length} active database vacancies.`
          : `Extracted ${skillCount} skills, evaluated ${expText} experience. No active job vacancies have been posted to the platform yet.`,
      });

    } catch (err: any) {
      console.error('Resume AI analysis error:', err);
      toast({
        title: 'Analysis Error',
        description: err.message || 'Could not parse resume. Please ensure file is valid.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleOpenResume = () => {
    if (previewUrl || resumeFile) {
      setShowPreviewModal(true);
    }
  };

  // Trigger Gemini Resume Optimization for a specific job
  const handleOpenOptimizeModal = async (job: MatchedJob) => {
    setOptimizingJob(job);
    setShowOptimizeModal(true);
    setIsOptimizing(true);
    setOptimizationData(null);
    setCopiedSummary(false);

    try {
      let data: any;
      try {
        const res = await apiClient.post('/api/ats/optimize-resume', {
          job_id: job.id,
          resume_id: profile?.resume_id,
        });
        data = res.data;
      } catch (clientErr: any) {
        const token = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('access_token') || sessionStorage.getItem('token') || '';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const endpoint = API_BASE_URL ? `${API_BASE_URL}/api/ats/optimize-resume` : '/api/ats/optimize-resume';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            job_id: job.id,
            resume_id: profile?.resume_id,
          }),
        });

        if (!res.ok) {
          let err = 'Optimization failed';
          try {
            const d = await res.json();
            err = d.detail || err;
          } catch {}
          throw new Error(err);
        }

        data = await res.json();
      }
      setOptimizationData(data);
    } catch (err: any) {
      console.error('Optimization error:', err);
      toast({
        title: 'Optimization Error',
        description: err.message || 'Could not retrieve tailored suggestions.',
        variant: 'destructive',
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleCopySummary = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    toast({
      title: 'Copied to Clipboard!',
      description: 'Tailored summary copied successfully.',
    });
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  // 1. Jobs pool: customized recommendations when in Customize mode, else resume-matched jobs
  const activeJobsPool = isCustomizeMode ? customRecommendations : matchedJobs;

  // 2. Jobs filtered by percentage adjustment bar
  const jobsFilteredByPercentage = useMemo(() => {
    return activeJobsPool.filter(j => j.match_percentage >= minMatchPercentage);
  }, [activeJobsPool, minMatchPercentage]);

  // Counts for the category taps
  const tapCounts = useMemo(() => {
    const pool = jobsFilteredByPercentage;
    return {
      all: pool.length,
      high: pool.filter(j => j.match_percentage >= 90).length,
      medium: pool.filter(j => j.match_percentage >= 80 && j.match_percentage < 90).length,
      under80: pool.filter(j => j.match_percentage < 80).length,
      applied: pool.filter(j => j.applied).length,
    };
  }, [jobsFilteredByPercentage]);

  // 3. Jobs displayed based on active tap
  const displayedJobs = useMemo(() => {
    return jobsFilteredByPercentage.filter(j => {
      if (activeJobTap === '90plus') return j.match_percentage >= 90;
      if (activeJobTap === '80to89') return j.match_percentage >= 80 && j.match_percentage < 90;
      if (activeJobTap === 'under80') return j.match_percentage < 80;
      if (activeJobTap === 'applied') return j.applied;
      return true; // 'all'
    });
  }, [jobsFilteredByPercentage, activeJobTap]);

  // Unapplied jobs currently displayed
  const unappliedDisplayedJobs = useMemo(() => {
    return displayedJobs.filter(j => !j.applied);
  }, [displayedJobs]);

  // Apply to a single job
  const handleApplySingle = async (jobId: string, customResumeName?: string) => {
    try {
      const targetJob = activeJobsPool.find(j => j.id === jobId);
      const recipientEmail = clientEmail || profile?.email || 'candidate@example.com';
      const recipientName = clientName || profile?.candidate_name || 'Candidate';
      const recipientPhone = clientPhone || profile?.phone || '';
      const verifiedExp = clientExperience || (profile as any)?.experience || (customExperienceYears === 0 ? 'Fresher' : `${customExperienceYears} yrs experience`);
      const resumeName = customResumeName || resumeFile?.name || (profile as any)?.resume_name || 'resume.pdf';

      // Mark as applied locally in both pools
      setMatchedJobs(prev =>
        prev.map(j => (j.id === jobId ? { ...j, applied: true } : j))
      );
      setCustomRecommendations(prev =>
        prev.map(j => (j.id === jobId ? { ...j, applied: true } : j))
      );

      // Persist application to Client Store & Database
      await applicationService.saveClientApplication({
        id: jobId,
        title: targetJob?.title || 'Software Engineer',
        company: targetJob?.company || 'AutoAgentHire Partner',
        location: targetJob?.location || 'Remote',
        match_score: targetJob?.match_percentage || 85,
        candidate_name: recipientName,
        candidate_email: recipientEmail,
        candidate_phone: recipientPhone,
        experience: verifiedExp,
        resume_filename: resumeName,
        url: '/candidate/jobs',
      });

      toast({
        title: 'Application Submitted! 🎉',
        description: `Personalized application dispatched for ${targetJob?.title} at ${targetJob?.company}!`,
      });
    } catch {
      toast({
        title: 'Application Recorded',
        description: 'Application recorded for this position.',
      });
    }
  };

  // Open "Check details of the client" popup
  const handleOpenApplyAllModal = () => {
    if (!resumeFile && !profile) {
      toast({
        title: 'Resume Required',
        description: 'Please upload a resume first to identify matching jobs.',
        variant: 'destructive',
      });
      return;
    }

    if (displayedJobs.length === 0) {
      toast({
        title: 'No Matching Jobs In View',
        description: `No jobs match the current ${minMatchPercentage}% threshold or tap filter. Try lowering the adjustment slider.`,
        variant: 'destructive',
      });
      return;
    }

    setShowApplyAllModal(true);
  };

  // Confirm and Apply to all jobs in the Job Matchings container
  const handleConfirmApplyAll = async () => {
    setIsSubmittingBatch(true);
    try {
      const targetJobIds = unappliedDisplayedJobs.map(j => j.id);

      if (targetJobIds.length === 0) {
        toast({
          title: 'Already Applied',
          description: 'All jobs in this view have already been applied to.',
        });
        setShowApplyAllModal(false);
        return;
      }

      const recipientEmail = (clientEmail || profile?.email || '').trim();
      const recipientName = (clientName || profile?.candidate_name || 'Candidate').trim();
      const recipientPhone = (clientPhone || profile?.phone || '').trim();
      const verifiedExp = (clientExperience || (profile as any)?.experience || 'Experience verified from resume').trim();
      const resumeName = resumeFile?.name || (profile as any)?.resume_name || 'resume.pdf';

      await applicationService.applyBatchApplications({
        candidate_name: recipientName,
        candidate_email: recipientEmail,
        candidate_phone: recipientPhone,
        candidate_experience: verifiedExp,
        resume_name: resumeName,
        jobs: unappliedDisplayedJobs.map(j => ({
          id: j.id,
          title: j.title,
          company: j.company,
          location: j.location,
          match_score: j.match_percentage,
        })),
      });

      setMatchedJobs(prev =>
        prev.map(j => (targetJobIds.includes(j.id) ? { ...j, applied: true } : j))
      );

      setShowApplyAllModal(false);

      toast({
        title: '🎉 Applications Submitted Successfully!',
        description: `Dispatched applications to ${targetJobIds.length} positions!`,
      });

    } catch (err: any) {
      console.error('Batch apply error:', err);
      const targetJobIds = unappliedDisplayedJobs.map(j => j.id);
      setMatchedJobs(prev =>
        prev.map(j => (targetJobIds.includes(j.id) ? { ...j, applied: true } : j))
      );
      setShowApplyAllModal(false);
      toast({
        title: 'Applications Recorded',
        description: `Submitted applications to matching positions.`,
      });
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const allSkillsList = profile?.all_skills || [];
  const technicalSkills = profile?.skills.technical || [];
  const professionalSkills = profile?.skills.professional || [];
  const domainSkills = profile?.skills.domain || [];

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-8 max-w-6xl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-primary" />
            Job Automation & Resume Intelligence
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Google Gemini-powered resume analysis, grounded job matching, and real-time ATS optimization.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {profile?.ai_powered && !isCustomizeMode && (
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1 flex items-center gap-1.5 shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>⚡ Google Gemini AI Active</span>
                <span className="opacity-70 text-[10px]">({profile.model_used || 'gemini-flash-latest'})</span>
              </Badge>
            </div>
          )}

          {/* Mode Distinction Badge */}
          <Badge
            variant="outline"
            className={`text-xs px-3 py-1 flex items-center gap-1.5 font-medium ${
              isCustomizeMode
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-muted/60 text-muted-foreground border-border/80'
            }`}
          >
            {isCustomizeMode ? (
              <>
                <Sliders className="w-3.5 h-3.5 text-primary" />
                <span>Active Mode: Manual Customization</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Active Mode: Resume-Based Recommendations</span>
              </>
            )}
          </Badge>

          {/* Customize Mode Switch */}
          <div className="flex items-center gap-2.5 bg-card/90 border border-border/80 rounded-full px-4 py-1.5 shadow-xs">
            <Sliders className="w-4 h-4 text-primary" />
            <Label
              htmlFor="customize-switch"
              className="text-xs font-semibold cursor-pointer text-foreground flex items-center gap-1.5 select-none"
            >
              <span>Customize</span>
              {isCustomizeMode && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 font-bold uppercase tracking-wider">
                  ON
                </Badge>
              )}
            </Label>
            <Switch
              id="customize-switch"
              checked={isCustomizeMode}
              onCheckedChange={handleToggleCustomize}
              className="data-[state=checked]:bg-primary"
            />
          </div>

          {/* Reset Page Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetConfirm(true)}
            className="text-xs border-border/80 text-muted-foreground hover:text-foreground gap-1.5 h-9"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Page</span>
          </Button>
        </div>
      </div>

      {/* =========================================================================
          ANIMATED CONTAINER SWITCH: RESUME INTELLIGENCE VS CUSTOMIZE FORM
         ========================================================================= */}
      <AnimatePresence mode="wait">
        {!isCustomizeMode ? (
          <motion.div
            key="resume-intelligence-view"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            {/* CONTAINER 1: RESUME CONTAINER & AI INSIGHTS */}
            <Card className="border border-primary/20 shadow-sm bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Resume & AI Intelligence
              </CardTitle>
              <CardDescription>
                Upload your resume in PDF, DOCX, or TXT format for deep AI parsing, experience extraction, and skill discovery.
              </CardDescription>
            </div>
            {profile?.last_updated && (
              <span className="text-xs text-muted-foreground">
                Last Analyzed: {new Date(profile.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Upload Drop Zone & Actions */}
          <div className="flex flex-wrap items-center gap-4 p-5 rounded-xl border-2 border-dashed border-primary/25 bg-primary/[0.02] hover:bg-primary/[0.04] transition-colors">
            <Label htmlFor="resume-upload" className="cursor-pointer">
              <div className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition shadow-sm font-medium text-sm">
                <Upload className="w-4 h-4" />
                {resumeFile ? 'Change Resume' : 'Upload Resume (PDF, DOCX, TXT)'}
              </div>
              <input
                id="resume-upload"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
            </Label>

            {resumeFile && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-foreground bg-background px-3.5 py-1.5 rounded-lg border shadow-xs">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="font-medium">{resumeFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(resumeFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenResume}
                  className="flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-primary" />
                  <span>Open Resume</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </Button>
              </div>
            )}

            {isAnalyzing && (
              <div className="flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 px-3.5 py-2 rounded-full animate-pulse ml-auto">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyzing resume with Google Gemini AI...
              </div>
            )}
          </div>

          {/* Profile Overview Card (After parsing) */}
          {profile && (
            <div className="p-4 rounded-xl bg-muted/40 border border-border/80 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                    {profile.candidate_name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{profile.candidate_name}</h3>
                    <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-3">
                      {profile.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{profile.email}</span>}
                      {profile.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{profile.phone}</span>}
                      <span className="flex items-center gap-1 font-semibold text-primary">
                        <Clock className="w-3 h-3" />
                        {profile.total_experience}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs py-1 border-primary/30 text-primary">
                    {allSkillsList.length} Skills Extracted
                  </Badge>
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs py-1">
                    {profile.total_experience}
                  </Badge>
                </div>
              </div>

              {profile.professional_summary && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground font-medium">Professional Summary: </strong>
                  {profile.professional_summary}
                </p>
              )}

              {/* Status Banner */}
              {profile.ai_powered ? (
                <div className="text-[11px] p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Live Google Gemini AI active ({profile.model_used || 'gemini-flash-latest'}). Structured intelligence verified from actual document text.</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 shrink-0">
                    Live Verified ✓
                  </Badge>
                </div>
              ) : profile.config_message && (
                <div className="text-[11px] p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{profile.config_message}</span>
                </div>
              )}

              {/* AI Resume Insights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {/* Verified Facts vs Inferences */}
                <div className="p-3 rounded-lg bg-background/50 border border-border/70 space-y-2">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Verified Facts vs Inferences
                  </h4>
                  <div className="space-y-1 text-[11px] text-muted-foreground">
                    <div className="font-medium text-foreground text-[10px] uppercase tracking-wider text-emerald-400/90">
                      Explicit Facts:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {profile.facts_vs_inferences?.explicit_facts?.slice(0, 3).map((f, i) => (
                        <li key={i} className="line-clamp-2">{f}</li>
                      )) || <li>Degrees and stated technical toolset extracted.</li>}
                    </ul>
                    <div className="font-medium text-foreground text-[10px] uppercase tracking-wider text-blue-400/90 pt-1">
                      Model Inferences:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {profile.facts_vs_inferences?.inferences?.slice(0, 2).map((inf, i) => (
                        <li key={i} className="line-clamp-2">{inf}</li>
                      )) || <li>Experience calculated at {profile.total_experience}.</li>}
                    </ul>
                  </div>
                </div>

                {/* Candidate Strengths & Suggested Improvements */}
                <div className="p-3 rounded-lg bg-background/50 border border-border/70 space-y-2">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Key Strengths & ATS Tips
                  </h4>
                  {profile.strengths && profile.strengths.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Strengths:</span>
                      <ul className="list-disc list-inside text-[11px] text-muted-foreground space-y-0.5">
                        {profile.strengths.slice(0, 2).map((s, i) => (
                          <li key={i} className="line-clamp-2">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {profile.suggested_improvements && profile.suggested_improvements.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/50">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-amber-400/90">ATS Optimization Tip:</span>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        {profile.suggested_improvements[0]}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================================
          CONTAINER 2: SKILLS CONTAINER (BELOW RESUME CONTAINER)
         ========================================================================= */}
      <Card className="border border-border/70 shadow-sm bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Skills & Technical Competencies
              </CardTitle>
              <CardDescription>
                Skills categorized and extracted from your resume by Google Gemini AI.
              </CardDescription>
            </div>
            {allSkillsList.length > 0 && (
              <Badge variant="secondary" className="px-3 py-1 font-semibold text-xs">
                {allSkillsList.length} Skills Recognized
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {allSkillsList.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-xl border-muted space-y-2">
              <Sparkles className="w-8 h-8 text-muted-foreground/60 mx-auto" />
              <h4 className="text-sm font-semibold text-foreground">No Skills Extracted Yet</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Upload your resume in the container above to automatically extract and display your technical, professional, and domain skills.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Technical Skills */}
              {technicalSkills.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Technical Skills</span>
                    <span className="text-[11px] text-primary font-medium">({technicalSkills.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {technicalSkills.map((skill, idx) => (
                      <Badge 
                        key={idx} 
                        className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/25 text-xs py-1 px-2.5 transition-colors"
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Professional Skills */}
              {professionalSkills.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Professional & Methodological</span>
                    <span className="text-[11px] text-muted-foreground">({professionalSkills.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {professionalSkills.map((skill, idx) => (
                      <Badge 
                        key={idx} 
                        variant="secondary"
                        className="text-xs py-1 px-2.5 bg-muted/80"
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Domain Expertise */}
              {domainSkills.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Domain Expertise</span>
                    <span className="text-[11px] text-muted-foreground">({domainSkills.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {domainSkills.map((skill, idx) => (
                      <Badge 
                        key={idx} 
                        variant="outline"
                        className="text-xs py-1 px-2.5 border-border/80"
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  ) : (
    <motion.div
      key="customize-preferences-view"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="space-y-6"
    >
      {/* =========================================================================
          NEW CONTAINER: CUSTOMIZE JOB RECOMMENDATIONS (NO RESUME REQUIRED)
         ========================================================================= */}
      <Card className="border border-primary/25 shadow-sm bg-card/70 backdrop-blur-sm">
        <CardHeader className="pb-4 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <Sliders className="w-5 h-5 text-primary" />
                Customize Job Recommendations
              </CardTitle>
              <CardDescription>
                Discover and rank matching positions tailored precisely to your skills, experience, and location preferences without requiring an uploaded resume.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30 font-semibold px-2.5 py-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Recommending</span>
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          {/* SECTION 1: SKILLS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-primary" />
                <span>SECTION 1: Technical & Professional Skills</span>
                <span className="text-xs text-muted-foreground font-normal">
                  ({customSkills.length} added)
                </span>
              </Label>
              <span className="text-[11px] text-muted-foreground">Press Enter or click Add</span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Enter a skill (e.g., Python, React, SQL, FastAPI, Machine Learning)..."
                  value={customSkillInput}
                  onChange={(e) => setCustomSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                  className="bg-background/80 text-xs sm:text-sm h-10 pr-8"
                />
                {customSkillInput && (
                  <button
                    type="button"
                    onClick={() => setCustomSkillInput("")}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                onClick={() => handleAddSkill()}
                disabled={!customSkillInput.trim()}
                className="h-10 px-4 text-xs font-semibold gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Skill</span>
              </Button>
            </div>

            {/* Added Skill Chips */}
            <div className="flex flex-wrap gap-2 min-h-8 items-center p-2.5 rounded-lg bg-background/50 border border-border/60">
              {customSkills.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">
                  No custom skills added yet. Type a skill above or click any suggestion below.
                </span>
              ) : (
                customSkills.map((skill) => (
                  <Badge
                    key={skill}
                    className="bg-primary/15 text-primary border border-primary/30 text-xs py-1 px-2.5 flex items-center gap-1.5 shadow-2xs hover:bg-primary/20 transition-all"
                  >
                    <span>{skill}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      className="text-primary/70 hover:text-destructive hover:scale-110 transition-transform"
                      title={`Remove ${skill}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </Badge>
                ))
              )}
            </div>

            {/* Skill Suggestions / Catalog Autocomplete */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary" />
                Popular Skill Suggestions (Click to add):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {skillSuggestions
                  .filter((s) => !customSkills.some((cs) => cs.toLowerCase() === s.toLowerCase()))
                  .slice(0, 14)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleAddSkill(s)}
                      className="text-[11px] px-2.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 opacity-60" />
                      <span>{s}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* SECTION 2: EXPERIENCE */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                <span>SECTION 2: Experience Level</span>
              </Label>
              <Badge variant="outline" className="text-xs border-primary/30 text-primary font-mono font-semibold">
                {customExperienceYears === 0 ? "🎓 Fresher (0 Years)" : `💼 ${customExperienceYears} Year${customExperienceYears > 1 ? "s" : ""}`}
              </Badge>
            </div>

            {/* Experience Level Selector: Fresher vs Experienced */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleExperienceLevelChange("fresher")}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                  experienceLevel === "fresher" && customExperienceYears === 0
                    ? "bg-primary/15 border-primary text-foreground ring-1 ring-primary shadow-xs"
                    : "bg-background/60 border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    experienceLevel === "fresher" && customExperienceYears === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-semibold text-xs sm:text-sm text-foreground">Fresher / Graduate</h5>
                    <p className="text-[11px] text-muted-foreground">0 years • Entry-level openings & internships</p>
                  </div>
                </div>
                {experienceLevel === "fresher" && customExperienceYears === 0 && (
                  <CheckCircle className="w-4 h-4 text-primary" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleExperienceLevelChange("experienced")}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                  experienceLevel === "experienced" || customExperienceYears > 0
                    ? "bg-primary/15 border-primary text-foreground ring-1 ring-primary shadow-xs"
                    : "bg-background/60 border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    experienceLevel === "experienced" || customExperienceYears > 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-semibold text-xs sm:text-sm text-foreground">Experienced Professional</h5>
                    <p className="text-[11px] text-muted-foreground">1+ years • Mid, senior & specialized roles</p>
                  </div>
                </div>
                {(experienceLevel === "experienced" || customExperienceYears > 0) && (
                  <CheckCircle className="w-4 h-4 text-primary" />
                )}
              </button>
            </div>

            {/* Quick Year Selection Buttons & Numeric Stepper */}
            <div className="space-y-2 pt-1">
              <span className="text-xs text-muted-foreground font-medium">Years of Experience:</span>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: "Fresher (0 yrs)", val: 0 },
                  { label: "0–1 yrs", val: 1 },
                  { label: "1–2 yrs", val: 2 },
                  { label: "2–3 yrs", val: 3 },
                  { label: "3–5 yrs", val: 5 },
                  { label: "5+ yrs", val: 6 },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleExperienceYearsChange(item.val)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                      (item.val === 0 && customExperienceYears === 0) ||
                      (item.val === 1 && customExperienceYears > 0 && customExperienceYears <= 1) ||
                      (item.val === 2 && customExperienceYears > 1 && customExperienceYears <= 2) ||
                      (item.val === 3 && customExperienceYears > 2 && customExperienceYears <= 3) ||
                      (item.val === 5 && customExperienceYears > 3 && customExperienceYears <= 5) ||
                      (item.val === 6 && customExperienceYears > 5)
                        ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}

                {/* Custom numeric stepper */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-muted-foreground">Exact:</span>
                  <Input
                    type="number"
                    min="0"
                    max="40"
                    step="0.5"
                    value={customExperienceYears}
                    onChange={(e) => {
                      const num = parseFloat(e.target.value) || 0;
                      handleExperienceYearsChange(num);
                    }}
                    className="w-20 h-8 text-xs bg-background/80 text-center font-mono"
                  />
                  <span className="text-xs text-muted-foreground">yrs</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: LOCATION */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                <span>SECTION 3: Preferred Location & Work Arrangement</span>
              </Label>
              <span className="text-[11px] text-muted-foreground">Supports Remote & Global Hubs</span>
            </div>

            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Enter city, state, country or 'Remote' (e.g., Hyderabad, Bengaluru, Remote)..."
                value={customLocation}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="pl-9 pr-8 bg-background/80 text-xs sm:text-sm h-10"
              />
              {customLocation && (
                <button
                  type="button"
                  onClick={() => handleLocationChange("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Location Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground font-medium mr-1">Quick Picks:</span>
              {[
                { label: "🌐 Remote", val: "Remote" },
                { label: "Hyderabad", val: "Hyderabad" },
                { label: "Bengaluru", val: "Bengaluru" },
                { label: "Chennai", val: "Chennai" },
                { label: "Mumbai", val: "Mumbai" },
                { label: "Delhi / NCR", val: "Delhi" },
                { label: "San Francisco", val: "San Francisco" },
                { label: "London", val: "London" },
              ].map((loc) => (
                <button
                  key={loc.val}
                  type="button"
                  onClick={() => handleSelectPresetLocation(loc.val)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    customLocation.toLowerCase() === loc.val.toLowerCase()
                      ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                  }`}
                >
                  {loc.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )}
</AnimatePresence>

      {/* =========================================================================
          PERCENTAGE ADJUSTMENT BAR (CONTROLS JOBS BELOW)
         ========================================================================= */}
      <Card className="border border-border/70 shadow-sm bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Sliders className="w-5 h-5 text-primary" />
                Match Percentage Adjustment Bar
              </CardTitle>
              <CardDescription>
                Slide to dynamically adjust the compatibility threshold and discover jobs that fit your profile.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-center">
              <span className="text-xs text-muted-foreground">Threshold:</span>
              <Badge className="bg-primary/15 text-primary border border-primary/30 font-bold text-sm px-3 py-1">
                &gt; {minMatchPercentage}% Match
              </Badge>
              <span className="text-xs text-muted-foreground">
                ({jobsFilteredByPercentage.length} Jobs Qualify)
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Slider input */}
          <div className="space-y-3 pt-2">
            <input
              type="range"
              min="40"
              max="95"
              step="5"
              value={minMatchPercentage}
              onChange={(e) => setMinMatchPercentage(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground font-medium px-1">
              <span>40% (Broad)</span>
              <span>60%</span>
              <span>75% (Balanced)</span>
              <span>85%</span>
              <span>95% (Exact)</span>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
            <span className="text-xs text-muted-foreground font-medium mr-1">Presets:</span>
            {[
              { label: 'All Openings (40%)', val: 40 },
              { label: 'Good Fit (60%)', val: 60 },
              { label: 'High Match (75%)', val: 75 },
              { label: 'Top Tier Only (85%)', val: 85 },
            ].map(preset => (
              <button
                key={preset.val}
                type="button"
                onClick={() => setMinMatchPercentage(preset.val)}
                className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                  minMatchPercentage === preset.val
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* =========================================================================
          CONTAINER 3: JOB MATCHINGS CONTAINER
         ========================================================================= */}
      <Card className="border border-border/70 shadow-sm bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-primary" />
                  Matching Jobs
                </CardTitle>
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  {displayedJobs.length} Displayed
                </Badge>
              </div>
              <CardDescription className="mt-1">
                Positions matched with your resume skills exceeding the {minMatchPercentage}% compatibility threshold.
              </CardDescription>
            </div>

            {/* "Apply All" Button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleOpenApplyAllModal}
                disabled={displayedJobs.length === 0 || unappliedDisplayedJobs.length === 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md px-5 py-2 flex items-center gap-2"
                size="default"
              >
                <Send className="w-4 h-4" />
                <span>
                  {unappliedDisplayedJobs.length === 0 && displayedJobs.length > 0
                    ? 'All Visible Jobs Applied ✓'
                    : `Apply All (${unappliedDisplayedJobs.length} Jobs)`}
                </span>
              </Button>
            </div>
          </div>

          {/* Category Taps */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mr-1">
              <Filter className="w-3.5 h-3.5 text-primary" />
              Category Taps:
            </span>

            {/* Tap 1: All Matches */}
            <button
              type="button"
              onClick={() => setActiveJobTap('all')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                activeJobTap === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>All Matches</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeJobTap === 'all' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-foreground'
              }`}>
                {tapCounts.all}
              </span>
            </button>

            {/* Tap 2: 90%+ Match */}
            <button
              type="button"
              onClick={() => setActiveJobTap('90plus')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                activeJobTap === '90plus'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              <span>90%+ Match</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeJobTap === '90plus' ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {tapCounts.high}
              </span>
            </button>

            {/* Tap 3: 80%-89% Match */}
            <button
              type="button"
              onClick={() => setActiveJobTap('80to89')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                activeJobTap === '80to89'
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
              }`}
            >
              <span>80%-89% Match</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeJobTap === '80to89' ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-400'
              }`}>
                {tapCounts.medium}
              </span>
            </button>

            {/* Tap 4: Under 80% */}
            {tapCounts.under80 > 0 && (
              <button
                type="button"
                onClick={() => setActiveJobTap('under80')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                  activeJobTap === 'under80'
                    ? 'bg-secondary text-secondary-foreground shadow-sm font-semibold'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span>Under 80%</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-background text-foreground">
                  {tapCounts.under80}
                </span>
              </button>
            )}

            {/* Tap 5: Applied */}
            <button
              type="button"
              onClick={() => setActiveJobTap('applied')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                activeJobTap === 'applied'
                  ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>Applied</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeJobTap === 'applied' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-foreground'
              }`}>
                {tapCounts.applied}
              </span>
            </button>
          </div>
        </CardHeader>

        <CardContent>
          {displayedJobs.length === 0 ? (
            <div className="p-10 text-center border-2 border-dashed rounded-xl border-muted space-y-3">
              <Briefcase className="w-10 h-10 text-muted-foreground/60 mx-auto" />
              <h4 className="text-base font-semibold text-foreground">
                {matchedJobs.length === 0 && profile
                  ? "No Approved Jobs Posted Yet"
                  : "No Matching Jobs to Display"}
              </h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {!profile
                  ? "Please upload your resume in the Resume container above to compute your match percentages against platform vacancies."
                  : matchedJobs.length === 0
                  ? "No active job openings have been posted to the platform yet. When recruiters post and publish vacancies, they will automatically be evaluated and matched against your resume here."
                  : `No positions found for the current ${minMatchPercentage}% adjustment threshold or "${activeJobTap}" tap filter. Try lowering the percentage bar above.`}
              </p>
              {matchedJobs.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { setMinMatchPercentage(40); setActiveJobTap('all'); }}
                  className="mt-2 text-xs"
                >
                  Reset Threshold to 40% & Show All
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedJobs.map(job => {
                const isHighMatch = job.match_percentage >= 90;
                const isMediumMatch = job.match_percentage >= 80 && job.match_percentage < 90;

                return (
                  <div
                    key={job.id}
                    className="p-5 rounded-xl border border-border/80 bg-background/60 hover:bg-background/90 transition-all flex flex-col justify-between space-y-4 hover:shadow-md"
                  >
                    {/* Top Row: Title, Company, Match % Badge */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h4 className="font-semibold text-base text-foreground line-clamp-1">{job.title}</h4>
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                            <Building className="w-3.5 h-3.5 text-primary" />
                            {job.company}
                          </p>
                        </div>

                        {/* Match Percentage Badge */}
                        <div className="shrink-0 text-right">
                          <Badge 
                            className={`px-3 py-1 text-xs font-bold ${
                              isHighMatch
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : isMediumMatch
                                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                : 'bg-primary/10 text-primary border-primary/20'
                            }`}
                          >
                            {job.match_percentage}% Match
                          </Badge>
                        </div>
                      </div>

                      {/* Match Progress Bar */}
                      <div className="space-y-1 pt-1">
                        <Progress value={job.match_percentage} className="h-1.5" />
                      </div>

                      {/* Job Meta details */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.employment_type}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-medium text-foreground"><DollarSign className="w-3 h-3 text-emerald-400" />{job.salary_range}</span>
                      </div>

                      {/* Grounded Suitability Reasoning */}
                      {job.suitability_reason && (
                        <div className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-md border border-border/50 space-y-1">
                          <p className="leading-relaxed">
                            <strong className="text-foreground font-medium">Why Suitable: </strong>
                            {job.suitability_reason}
                          </p>
                        </div>
                      )}

                      {/* Matching Skills */}
                      {job.matching_skills.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[11px] font-medium text-muted-foreground">Matching Skills:</span>
                          <div className="flex flex-wrap gap-1">
                            {job.matching_skills.slice(0, 5).map((s, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                ✓ {s}
                              </Badge>
                            ))}
                            {job.matching_skills.length > 5 && (
                              <span className="text-[10px] text-muted-foreground self-center">
                                +{job.matching_skills.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Missing Required Skills */}
                      {job.missing_skills.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[11px] font-medium text-amber-400/90">Missing / Unverified Skills:</span>
                          <div className="flex flex-wrap gap-1">
                            {job.missing_skills.slice(0, 3).map((s, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
                                • {s}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Row */}
                    <div className="pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* View Details Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedJobForDetails(job)}
                          className="text-xs h-8 gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5 text-primary" />
                          <span>View Details</span>
                        </Button>

                        {/* Apply Now Button */}
                        {job.applied ? (
                          <Badge className="bg-emerald-600 text-white font-medium flex items-center gap-1 text-xs py-1 px-3 h-8">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Applied</span>
                          </Badge>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleOpenApplyModal(job)}
                            className="text-xs h-8 gap-1.5 bg-primary text-primary-foreground font-medium shadow-2xs hover:bg-primary/90"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Apply Now</span>
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {job.experience_compatibility && (
                          <Badge variant="outline" className="text-[10px] bg-muted/40 text-muted-foreground border-border/60">
                            {job.experience_compatibility}
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                          Verified Vacancy
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================================
          MODAL: CHECK DETAILS OF THE CLIENT & VERIFY EXPERIENCE BEFORE APPLYING
         ========================================================================= */}
      <Dialog open={showApplyAllModal} onOpenChange={setShowApplyAllModal}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <ShieldCheck className="w-6 h-6 text-primary" />
              Check Client Details Before Applying
            </DialogTitle>
            <DialogDescription>
              Review and verify the client's information and experience before submitting applications to {unappliedDisplayedJobs.length} matching positions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-primary" />
                  Candidate Details Verification
                </h4>
                <span className="text-[11px] text-muted-foreground">
                  Editable for precise accuracy
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Full Name</label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Candidate Name"
                    className="h-8 text-xs bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Email</label>
                  <Input
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="Candidate Email"
                    className="h-8 text-xs bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Phone</label>
                  <Input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="Phone number"
                    className="h-8 text-xs bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Verified Experience</label>
                  <Input
                    value={clientExperience}
                    onChange={(e) => setClientExperience(e.target.value)}
                    placeholder="e.g. 2+ years"
                    className="h-8 text-xs bg-background font-medium text-primary"
                  />
                </div>
              </div>
            </div>

            {/* Targeted Positions Preview */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Targeted Positions ({unappliedDisplayedJobs.length} Positions)
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-2 border border-border/60 rounded-xl p-3 bg-background/50">
                {unappliedDisplayedJobs.map(j => (
                  <div key={j.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-muted/40">
                    <div>
                      <span className="font-medium text-foreground block">{j.title}</span>
                      <span className="text-muted-foreground text-[11px] block">{j.company} • {j.location}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold">
                      {j.match_percentage}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowApplyAllModal(false)}
              disabled={isSubmittingBatch}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmApplyAll}
              disabled={isSubmittingBatch || unappliedDisplayedJobs.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2"
            >
              {isSubmittingBatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting Applications...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Confirm & Apply {unappliedDisplayedJobs.length} Jobs
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAL: RESUME OPTIMIZATION FOR TARGET JOB
         ========================================================================= */}
      <Dialog open={showOptimizeModal} onOpenChange={setShowOptimizeModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="w-5 h-5 text-primary" />
              Tailored Resume Optimization
            </DialogTitle>
            <DialogDescription>
              {optimizingJob ? `${optimizingJob.title} at ${optimizingJob.company}` : 'Target Job Position'}
            </DialogDescription>
          </DialogHeader>

          {isOptimizing ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Analyzing Job Description & Candidate Resume...</h4>
              <p className="text-xs text-muted-foreground max-w-md">
                Formulating ATS keywords, bullet point enhancements, and project framing recommendations with Google Gemini AI.
              </p>
            </div>
          ) : optimizationData ? (
            <div className="space-y-5 py-2">
              {/* Section 1: Missing Keywords */}
              {optimizationData.missing_keywords && optimizationData.missing_keywords.length > 0 && (
                <div className="p-4 rounded-xl bg-muted/40 border border-border/80 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-primary" />
                    Recommended Keywords for this Position
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Adding these keywords where you have relevant experience will help your resume pass recruiter filters:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {optimizationData.missing_keywords.map((kw, i) => (
                      <Badge key={i} variant="outline" className="text-xs py-1 px-2.5 bg-primary/10 text-primary border-primary/25">
                        + {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 2: Bullet Point Improvements */}
              {optimizationData.bullet_point_improvements && optimizationData.bullet_point_improvements.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Action-Oriented Bullet Point Rewrites
                  </h4>
                  <div className="space-y-3">
                    {optimizationData.bullet_point_improvements.map((bp, i) => (
                      <div key={i} className="p-3.5 rounded-lg border border-border/70 bg-background/50 space-y-2 text-xs">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original:</span>
                          <p className="text-muted-foreground italic bg-muted/30 p-2 rounded border border-border/40">
                            "{bp.original}"
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Suggested Action Rewrite:</span>
                          <p className="text-foreground font-medium bg-emerald-500/10 text-emerald-300 p-2 rounded border border-emerald-500/20">
                            {bp.improved}
                          </p>
                        </div>
                        {bp.rationale && (
                          <p className="text-[11px] text-muted-foreground">
                            <strong className="text-foreground">Why: </strong>
                            {bp.rationale}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 3: Project Framing */}
              {optimizationData.project_descriptions && optimizationData.project_descriptions.length > 0 && (
                <div className="p-4 rounded-xl bg-muted/40 border border-border/80 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-primary" />
                    Project Alignment Suggestions
                  </h4>
                  <div className="space-y-2 text-xs">
                    {optimizationData.project_descriptions.map((proj, i) => (
                      <div key={i} className="space-y-1">
                        <span className="font-semibold text-foreground">{proj.project_name}:</span>
                        <p className="text-muted-foreground">{proj.suggestions}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 4: Tailored Professional Summary */}
              {optimizationData.tailored_professional_summary && (
                <div className="p-4 rounded-xl bg-muted/40 border border-border/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-primary" />
                      Tailored Professional Summary
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopySummary(optimizationData.tailored_professional_summary)}
                      className="text-xs h-7 flex items-center gap-1"
                    >
                      {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSummary ? 'Copied' : 'Copy Summary'}</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed bg-background/60 p-3 rounded-lg border border-border/60">
                    {optimizationData.tailored_professional_summary}
                  </p>
                </div>
              )}

              {/* Section 5: Formatting Recommendations */}
              {optimizationData.formatting_recommendations && optimizationData.formatting_recommendations.length > 0 && (
                <div className="p-3.5 rounded-lg border border-border/60 bg-background/40 space-y-1.5 text-xs">
                  <h5 className="font-semibold text-foreground text-[11px] uppercase tracking-wider">Formatting & ATS Advice:</h5>
                  <ul className="list-disc list-inside text-muted-foreground space-y-0.5 text-[11px]">
                    {optimizationData.formatting_recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No optimization data available.
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOptimizeModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal for viewing the resume directly */}
      <ResumeDocumentPreview
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        file={resumeFile}
        fileUrl={previewUrl}
        filename={resumeFile?.name}
      />

      {/* =========================================================================
          MODAL: VIEW DETAILS OF A JOB
         ========================================================================= */}
      <Dialog open={Boolean(selectedJobForDetails)} onOpenChange={(open) => !open && setSelectedJobForDetails(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedJobForDetails && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pr-6">
                  <div>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-primary" />
                      {selectedJobForDetails.title}
                    </DialogTitle>
                    <DialogDescription className="text-sm font-medium text-foreground/80 mt-1 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1 font-semibold text-primary">
                        <Building className="w-3.5 h-3.5" />
                        {selectedJobForDetails.company}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        {selectedJobForDetails.location}
                      </span>
                      {selectedJobForDetails.employment_type && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          {selectedJobForDetails.employment_type}
                        </span>
                      )}
                    </DialogDescription>
                  </div>
                  <Badge className="bg-primary/15 text-primary border border-primary/30 font-bold px-3 py-1.5 text-sm shrink-0">
                    {selectedJobForDetails.match_percentage}% Match
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-5 py-3">
                {/* Suitability Reason */}
                {selectedJobForDetails.suitability_reason && (
                  <div className="p-3.5 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
                    <h4 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Relevance & Match Insights
                    </h4>
                    <p className="text-xs text-foreground/90 leading-relaxed">
                      {selectedJobForDetails.suitability_reason}
                    </p>
                  </div>
                )}

                {/* Experience Compatibility */}
                {selectedJobForDetails.experience_compatibility && (
                  <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">Experience Requirement:</span>
                    <Badge variant="outline" className="bg-background text-foreground font-semibold">
                      {selectedJobForDetails.experience_compatibility}
                    </Badge>
                  </div>
                )}

                {/* Skills Analysis */}
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Matching Skills ({selectedJobForDetails.matching_skills.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedJobForDetails.matching_skills.length > 0 ? (
                        selectedJobForDetails.matching_skills.map((skill, i) => (
                          <Badge key={i} className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs">
                            ✓ {skill}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No directly matching skills found</span>
                      )}
                    </div>
                  </div>

                  {selectedJobForDetails.missing_skills.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Missing or Recommended Skills ({selectedJobForDetails.missing_skills.length})
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedJobForDetails.missing_skills.map((skill, i) => (
                          <Badge key={i} variant="outline" className="border-border text-muted-foreground text-xs">
                            + {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Full Job Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    Job Description
                  </h4>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/60 max-h-64 overflow-y-auto">
                    <JobDescriptionRenderer content={selectedJobForDetails.description} />
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-border">
                <Button variant="outline" onClick={() => setSelectedJobForDetails(null)}>
                  Close
                </Button>
                {selectedJobForDetails.applied ? (
                  <Badge className="bg-emerald-600 text-white font-medium flex items-center gap-1 text-xs py-1.5 px-4 h-9">
                    <CheckCircle2 className="w-4 h-4" />
                    Already Applied
                  </Badge>
                ) : (
                  <Button
                    variant="default"
                    onClick={() => {
                      const job = selectedJobForDetails;
                      setSelectedJobForDetails(null);
                      handleOpenApplyModal(job);
                    }}
                    className="gap-2 bg-primary font-medium"
                  >
                    <Send className="w-4 h-4" />
                    <span>Apply for Role</span>
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAL: APPLY NOW (CANDIDATE DETAILS + RESUME VERIFICATION)
         ========================================================================= */}
      <Dialog open={Boolean(applyingJob)} onOpenChange={(open) => !open && setApplyingJob(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {applySuccessResult ? (
            <div className="py-6 space-y-5 text-center">
              <div className="w-14 h-14 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <DialogTitle className="text-xl font-bold">Application Successfully Submitted!</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Your application has been registered and synced with your persistent Application Tracking dashboard.
                </DialogDescription>
              </div>

              <div className="p-4 rounded-xl bg-muted/40 border border-border text-left space-y-2 text-xs">
                <div className="flex justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground font-medium">Position:</span>
                  <span className="font-semibold text-foreground">{applySuccessResult.job_title}</span>
                </div>
                <div className="flex justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground font-medium">Company:</span>
                  <span className="font-semibold text-foreground">{applySuccessResult.company}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground font-medium">Official Reference ID:</span>
                  <span className="font-mono font-bold text-primary">{applySuccessResult.reference_id}</span>
                </div>
              </div>

              <Button
                variant="default"
                className="w-full bg-primary"
                onClick={() => {
                  setApplyingJob(null);
                  setApplySuccessResult(null);
                }}
              >
                Done
              </Button>
            </div>
          ) : applyingJob && (
            <form onSubmit={handleSubmitSingleApply}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <Send className="w-5 h-5 text-primary" />
                  Apply for {applyingJob.title}
                </DialogTitle>
                <DialogDescription>
                  Review your candidate details and attach your resume before submitting to <strong className="text-foreground">{applyingJob.company}</strong>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Candidate Info Verification */}
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-primary" />
                    Candidate Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <Label className="text-[11px] text-muted-foreground block mb-1">Full Name *</Label>
                      <Input
                        value={applyCandidateName}
                        onChange={(e) => setApplyCandidateName(e.target.value)}
                        placeholder="e.g. Alex Morgan"
                        required
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground block mb-1">Email Address *</Label>
                      <Input
                        type="email"
                        value={applyCandidateEmail}
                        onChange={(e) => setApplyCandidateEmail(e.target.value)}
                        placeholder="e.g. alex@example.com"
                        required
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-[11px] text-muted-foreground block mb-1">Phone Number</Label>
                      <Input
                        type="tel"
                        value={applyCandidatePhone}
                        onChange={(e) => setApplyCandidatePhone(e.target.value)}
                        placeholder="e.g. +1 (555) 234-5678"
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>
                </div>

                {/* Resume Upload / Attachment Section */}
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      Resume Attachment *
                    </h4>
                    {(applyResumeFile || resumeFile) && (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                        ✓ Ready
                      </Badge>
                    )}
                  </div>

                  {applyResumeFile ? (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border text-xs">
                      <span className="font-medium text-foreground truncate max-w-[280px]">
                        📄 {applyResumeFile.name} ({(applyResumeFile.size / 1024).toFixed(1)} KB)
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setApplyResumeFile(null)}
                        className="text-xs h-6 px-2 text-destructive hover:bg-destructive/10"
                      >
                        Remove
                      </Button>
                    </div>
                  ) : resumeFile ? (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border text-xs">
                      <span className="font-medium text-foreground truncate max-w-[280px]">
                        📄 {resumeFile.name} (Active Profile Resume)
                      </span>
                      <label className="text-xs text-primary hover:underline cursor-pointer font-medium">
                        Change
                        <input
                          type="file"
                          accept=".pdf,.docx,.doc,.txt"
                          onChange={(e) => e.target.files?.[0] && setApplyResumeFile(e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="border border-dashed border-border rounded-lg p-4 text-center bg-background/50 hover:bg-background/80 transition-colors">
                      <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1.5" />
                      <p className="text-xs font-medium text-foreground">Upload your resume for this application</p>
                      <p className="text-[11px] text-muted-foreground mb-2.5">PDF, DOCX, or TXT up to 10MB</p>
                      <label>
                        <Button type="button" variant="outline" size="sm" className="text-xs pointer-events-none">
                          Browse File
                        </Button>
                        <input
                          type="file"
                          accept=".pdf,.docx,.doc,.txt"
                          onChange={(e) => e.target.files?.[0] && setApplyResumeFile(e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Optional Cover Letter */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Optional Cover Note / Note to Recruiter</Label>
                  <textarea
                    rows={3}
                    value={applyCoverLetter}
                    onChange={(e) => setApplyCoverLetter(e.target.value)}
                    placeholder="Briefly state your passion or key relevant accomplishments for this position..."
                    className="w-full text-xs p-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApplyingJob(null)}
                  disabled={isSubmittingSingleApply}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingSingleApply}
                  className="bg-primary gap-2"
                >
                  {isSubmittingSingleApply ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting Application...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Application
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              Reset Page?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to reset all temporary automation configurations, manual filters, and search inputs? Your saved profile, resumes, and submitted applications will remain untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="text-xs border-border">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetPage}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold"
            >
              Reset Page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
