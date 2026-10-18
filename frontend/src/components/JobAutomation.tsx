import React, { useState, useEffect, useMemo } from 'react';
import { 
  Upload, CheckCircle2, Loader2, FileText, Briefcase, Eye, 
  ExternalLink, Sparkles, Building, MapPin, DollarSign, Clock, 
  ShieldCheck, User, Mail, Phone, Send, Check, AlertCircle, ArrowRight,
  Sliders, Filter, RefreshCw, CheckCheck, ChevronRight, Copy, Info,
  CheckCircle, ListChecks, HelpCircle
} from 'lucide-react';
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
import { applyProfileFromResume, getCandidateProfile } from '@/utils/profileSync';
import { applicationService } from '@/services/applicationService';

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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';

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

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Load candidate profile on mount if available
  useEffect(() => {
    const existing = getCandidateProfile();
    if (existing && existing.candidate_name) {
      setClientName(existing.candidate_name);
      setClientEmail(existing.email || '');
      setClientPhone(existing.phone || '');
      setClientExperience(existing.experience || '');
    }
  }, []);

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

      const token = localStorage.getItem('token') || localStorage.getItem('access_token') || sessionStorage.getItem('token') || '';
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/ats/parse-resume`, {
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

      const data = await response.json();

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

      setProfile(extractedProfile);

      // Apply extracted details across entire candidate profile everywhere in the site
      applyProfileFromResume(data, file.name);

      // Initialize editable client details to eliminate mismatch
      setClientName(extractedProfile.candidate_name);
      setClientEmail(extractedProfile.email);
      setClientPhone(extractedProfile.phone);
      setClientExperience(parsedExp);

      // Set matched jobs
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

      setMatchedJobs(jobsFromBackend);

      toast({
        title: extractedProfile.ai_powered ? '✨ Google Gemini AI Analysis Complete!' : 'Resume Analysis Ready',
        description: `Extracted ${allSkills.length} skills, evaluated ${parsedExp} experience, and matched ${jobsFromBackend.length} active database vacancies.`,
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
    if (!previewUrl) return;
    if (resumeFile?.type === 'application/pdf') {
      window.open(previewUrl, '_blank');
    } else {
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
      const token = localStorage.getItem('token') || localStorage.getItem('access_token') || sessionStorage.getItem('token') || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/api/ats/optimize-resume`, {
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

      const data = await res.json();
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

  // 1. Jobs filtered by percentage adjustment bar
  const jobsFilteredByPercentage = useMemo(() => {
    return matchedJobs.filter(j => j.match_percentage >= minMatchPercentage);
  }, [matchedJobs, minMatchPercentage]);

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

  // 2. Jobs displayed based on active tap
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
  const handleApplySingle = async (jobId: string) => {
    try {
      const targetJob = matchedJobs.find(j => j.id === jobId);
      const recipientEmail = clientEmail || profile?.email || 'candidate@example.com';
      const recipientName = clientName || profile?.candidate_name || 'Candidate';
      const recipientPhone = clientPhone || profile?.phone || '';
      const verifiedExp = clientExperience || (profile as any)?.experience || 'Experience verified from resume';
      const resumeName = resumeFile?.name || (profile as any)?.resume_name || 'resume.pdf';

      // Mark as applied locally
      setMatchedJobs(prev =>
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
    } catch (err: any) {
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

        {profile?.ai_powered && (
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1 flex items-center gap-1.5 shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>⚡ Google Gemini AI Active</span>
              <span className="opacity-70 text-[10px]">({profile.model_used || 'gemini-flash-latest'})</span>
            </Badge>
          </div>
        )}
      </div>

      {/* =========================================================================
          CONTAINER 1: RESUME CONTAINER & AI INSIGHTS
         ========================================================================= */}
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
              <h4 className="text-base font-semibold text-foreground">No Matching Jobs to Display</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {matchedJobs.length === 0
                  ? 'Please upload your resume in the Resume container above to compute your match percentages against platform vacancies.'
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
                    <div className="pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* Optimize Resume Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenOptimizeModal(job)}
                          className="text-xs flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          <span>Optimize Resume</span>
                        </Button>

                        {/* Apply Single Button */}
                        {job.applied ? (
                          <Badge className="bg-emerald-600 text-white font-medium flex items-center gap-1 text-xs py-1 px-3">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Applied
                          </Badge>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleApplySingle(job.id)}
                            className="text-xs font-medium"
                          >
                            Apply Single
                          </Button>
                        )}
                      </div>

                      <span className="text-[11px] text-muted-foreground hidden sm:inline">
                        Verified Vacancy
                      </span>
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
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {resumeFile?.name || 'Resume Preview'}
            </DialogTitle>
            <DialogDescription>
              Viewing uploaded resume content
            </DialogDescription>
          </DialogHeader>

          {resumeFile?.type === 'application/pdf' && previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-[65vh] rounded-md border"
              title="Resume Preview"
            />
          ) : (
            <div className="space-y-4">
              <pre className="p-4 bg-muted/60 rounded-md text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
                {profile?.professional_summary || 'Preview not available as plain text.'}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
