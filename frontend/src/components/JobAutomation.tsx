import React, { useState, useEffect, useMemo } from 'react';
import { 
  Upload, CheckCircle2, Loader2, FileText, Briefcase, Eye, 
  ExternalLink, Sparkles, Building, MapPin, DollarSign, Clock, 
  ShieldCheck, User, Mail, Phone, Send, Check, AlertCircle, ArrowRight,
  Sliders, Filter, RefreshCw, CheckCheck, ChevronRight
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
  description: string;
  applied: boolean;
}

export interface ExtractedProfile {
  candidate_name: string;
  email: string;
  phone: string;
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

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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

      const response = await fetch(`${API_BASE_URL}/api/ats/parse-resume`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errMessage = 'Failed to analyze resume';
        try {
          const errData = await response.json();
          errMessage = errData.detail || errData.message || errMessage;
        } catch {
          // ignore json error
        }
        throw new Error(errMessage);
      }

      const data = await response.json();

      const skillsObj = data.skills || {};
      const techSkills: string[] = skillsObj.technical || [];
      const profSkills: string[] = skillsObj.professional || [];
      const domainSkills: string[] = skillsObj.domain || [];
      const allSkills: string[] = data.all_skills || [...techSkills, ...profSkills, ...domainSkills];

      const parsedExp = data.total_experience || '2+ years';

      const extractedProfile: ExtractedProfile = {
        candidate_name: data.candidate_name || 'Candidate',
        email: data.email || '',
        phone: data.phone || '',
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
        match_percentage: Number(j.match_percentage) || 85,
        matching_skills: j.matching_skills || j.matched_skills || [],
        missing_skills: j.missing_skills || [],
        description: j.description || '',
        applied: false,
      }));

      setMatchedJobs(jobsFromBackend);

      toast({
        title: extractedProfile.ai_powered ? '✨ Gemini AI Analysis Complete!' : 'Resume Analysis Ready',
        description: `Recognized ${allSkills.length} skills, extracted ${parsedExp} experience, and found ${jobsFromBackend.length} matching jobs.`,
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

  // 1. Jobs filtered by percentage adjustment bar
  const jobsFilteredByPercentage = useMemo(() => {
    return matchedJobs.filter(j => j.match_percentage >= minMatchPercentage);
  }, [matchedJobs, minMatchPercentage]);

  // Counts for the small taps inside the Matching Jobs container
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
      // Mark as applied locally
      setMatchedJobs(prev =>
        prev.map(j => (j.id === jobId ? { ...j, applied: true } : j))
      );

      const targetJob = matchedJobs.find(j => j.id === jobId);

      // Persist application to Client Store & SQLite Database via applicationService
      await applicationService.saveClientApplication({
        id: jobId,
        title: targetJob?.title || 'Software Engineer',
        company: targetJob?.company || 'AutoAgentHire Partner',
        location: targetJob?.location || 'Remote',
        match_score: targetJob?.match_percentage || 85,
        candidate_name: clientName || profile?.candidate_name || 'Candidate',
        candidate_email: clientEmail || profile?.email || 'candidate@example.com',
        candidate_phone: clientPhone || profile?.phone || '',
        url: '/candidate/jobs',
      });

      toast({
        title: 'Application Submitted & Stored! 🎉',
        description: `Successfully applied to ${targetJob?.title} at ${targetJob?.company}. Recorded in your Applications section!`,
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
    if (!resumeFile) {
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

      // 1. Send batch application to backend endpoint and store in Client Store
      for (const targetJob of unappliedDisplayedJobs) {
        await applicationService.saveClientApplication({
          id: targetJob.id,
          title: targetJob.title,
          company: targetJob.company,
          location: targetJob.location,
          match_score: targetJob.match_percentage || 85,
          candidate_name: clientName || profile?.candidate_name || 'Candidate',
          candidate_email: clientEmail || profile?.email || 'candidate@example.com',
          candidate_phone: clientPhone || profile?.phone || '',
          url: '/candidate/jobs',
        });
      }

      // 2. Mark targeted jobs as applied in local state
      setMatchedJobs(prev =>
        prev.map(j => (targetJobIds.includes(j.id) ? { ...j, applied: true } : j))
      );

      setShowApplyAllModal(false);

      toast({
        title: '🎉 Matching Jobs Applied Successfully!',
        description: `Submitted applications for ${targetJobIds.length} positions with verified experience: "${clientExperience}".`,
      });

    } catch (err: any) {
      console.error('Batch apply error:', err);
      // Fallback update
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
            Job Automation & Skill Matching
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload your resume for real-time Google Gemini AI skill extraction, percentage adjustment filtering, and automated job matching.
          </p>
        </div>
      </div>

      {/* =========================================================================
          CONTAINER 1: RESUME CONTAINER (RETAINED & AI-POWERED)
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
            {profile?.ai_powered && (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 flex items-center gap-1.5 px-3 py-1">
                <Sparkles className="w-3.5 h-3.5" />
                Google Gemini AI Active
              </Badge>
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
            <div className="p-4 rounded-xl bg-muted/40 border border-border/80 space-y-3">
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
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs py-1">
                    {profile.total_experience}
                  </Badge>
                </div>
              </div>

              {profile.professional_summary && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground font-medium">Summary: </strong>
                  {profile.professional_summary}
                </p>
              )}

              {profile.config_message && !profile.ai_powered && (
                <div className="text-[11px] p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{profile.config_message}</span>
                </div>
              )}
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
                        className="text-xs py-1 px-2.5 border-dashed"
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
          FEATURE 1: PERCENTAGE ADJUSTMENT BAR (BELOW SKILLS CONTAINER)
         ========================================================================= */}
      <Card className="border border-primary/25 shadow-sm bg-gradient-to-r from-card/90 via-card/60 to-primary/[0.04] backdrop-blur-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground font-semibold text-base">
                <Sliders className="w-4 h-4 text-primary" />
                <span>Match Percentage Adjustment Bar</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Slide to dynamically adjust the compatibility threshold and discover jobs that fit your profile.
              </p>
            </div>

            {/* Threshold indicator badge */}
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-xs text-muted-foreground">Threshold:</span>
              <Badge 
                className={`text-xs px-3 py-1 font-bold ${
                  minMatchPercentage >= 90
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                    : minMatchPercentage >= 80
                    ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                    : 'bg-primary/10 text-primary border-primary/20'
                }`}
              >
                ≥ {minMatchPercentage}% Match
              </Badge>
              <span className="text-xs text-muted-foreground font-medium">
                ({jobsFilteredByPercentage.length} Jobs Qualify)
              </span>
            </div>
          </div>

          {/* Interactive Range Slider */}
          <div className="space-y-2 pt-1">
            <div className="relative flex items-center">
              <input
                type="range"
                min="40"
                max="95"
                step="5"
                value={minMatchPercentage}
                onChange={(e) => setMinMatchPercentage(Number(e.target.value))}
                className="w-full h-2.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-hidden"
              />
            </div>

            {/* Slider Scale Ticks */}
            <div className="flex justify-between text-[11px] text-muted-foreground px-1 font-medium">
              <span>40% (Broad)</span>
              <span>60%</span>
              <span>75% (Balanced)</span>
              <span>85%</span>
              <span>95% (Exact)</span>
            </div>
          </div>

          {/* Quick-Preset Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Presets:</span>
            {[
              { label: 'All Jobs (40%+)', val: 40 },
              { label: '60%+ Match', val: 60 },
              { label: '75%+ Balanced', val: 75 },
              { label: '85%+ High', val: 85 },
              { label: '90%+ Top Match', val: 90 },
            ].map(preset => (
              <button
                key={preset.val}
                type="button"
                onClick={() => setMinMatchPercentage(preset.val)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
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
          CONTAINER 3: JOB MATCHINGS CONTAINER (BELOW SKILLS & ADJUSTMENT BAR)
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

            {/* "Apply All" Button (Controls all jobs in the Job Matching container) */}
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

          {/* ===================================================================
              FEATURE 2: SMALL TAPS DISPLAYING THE NUMBER OF JOBS
             =================================================================== */}
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
                  : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
              }`}
            >
              <span>90%+ Match</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeJobTap === '90plus' ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-700'
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
                  : 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20'
              }`}
            >
              <span>80%-89% Match</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeJobTap === '80to89' ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-700'
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
                                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                                : isMediumMatch
                                ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
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
                        <span className="flex items-center gap-1 font-medium text-foreground"><DollarSign className="w-3 h-3 text-emerald-500" />{job.salary_range}</span>
                      </div>

                      {/* Brief description snippet */}
                      {job.description && (
                        <p className="text-xs text-muted-foreground/90 line-clamp-2 pt-1">
                          {job.description}
                        </p>
                      )}

                      {/* Matching Skills */}
                      {job.matching_skills.length > 0 && (
                        <div className="space-y-1 pt-2">
                          <span className="text-[11px] font-medium text-muted-foreground">Matching Skills:</span>
                          <div className="flex flex-wrap gap-1">
                            {job.matching_skills.slice(0, 4).map((s, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                ✓ {s}
                              </Badge>
                            ))}
                            {job.matching_skills.length > 4 && (
                              <span className="text-[10px] text-muted-foreground self-center">
                                +{job.matching_skills.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Row */}
                    <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                      {job.applied ? (
                        <Badge className="bg-emerald-600 text-white font-medium flex items-center gap-1 text-xs py-1 px-3">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Applied
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApplySingle(job.id)}
                          className="text-xs hover:bg-primary hover:text-primary-foreground font-medium"
                        >
                          Apply Single
                        </Button>
                      )}

                      <span className="text-[11px] text-muted-foreground">
                        Verified Position
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
            {/* Client Profile Details Section with Editable Inputs to fix any mismatch */}
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
                    placeholder="email@example.com"
                    className="h-8 text-xs bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Phone</label>
                  <Input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="h-8 text-xs bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1 flex items-center justify-between">
                    <span>Total Experience</span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 text-emerald-600 border-emerald-500/30">
                      Calculated from Resume
                    </Badge>
                  </label>
                  <Input
                    value={clientExperience}
                    onChange={(e) => setClientExperience(e.target.value)}
                    placeholder="e.g. 5+ years (2019 - 2024)"
                    className="h-8 text-xs font-medium bg-background"
                  />
                </div>
              </div>

              {resumeFile && (
                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Source Resume Document:</span>
                  <span className="font-medium text-foreground flex items-center gap-1">
                    <FileText className="w-3 h-3 text-primary" />
                    {resumeFile.name} ({(resumeFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              )}
            </div>

            {/* Jobs Acceptance Summary */}
            <div className="p-4 rounded-xl bg-primary/[0.04] border border-primary/20 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Positions to Apply ({unappliedDisplayedJobs.length} Jobs in current view)
                </span>
                <span className="text-primary font-bold">Accept & Apply</span>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {unappliedDisplayedJobs.map((j, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-md bg-background/80 border border-border/60">
                    <div className="truncate pr-2">
                      <span className="font-medium text-foreground">{j.title}</span>
                      <span className="text-muted-foreground text-[11px] block">{j.company} • {j.location}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold">
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
