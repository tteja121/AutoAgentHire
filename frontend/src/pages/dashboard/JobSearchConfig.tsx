import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import {
  Search, MapPin, Upload, FileText,
  Zap, ArrowLeft, Play, Save, X, Sparkles, CheckCircle2,
  Loader2, Sliders, Building2, DollarSign, Clock, Users,
  Mail, Phone, GraduationCap, Award, Briefcase, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jobService } from "@/services/jobService";
import { applicationService } from "@/services/applicationService";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { applyProfileFromResume, getCandidateProfile } from "@/utils/profileSync";

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as Record<string, any>;
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.detail === 'string' && e.detail) return e.detail;
    if (typeof e.error === 'string' && e.error) return e.error;
    if (Array.isArray(e.errors) && e.errors.length) return e.errors.join('\n');
    if (Array.isArray(e.detail)) {
      return e.detail.map((d: any) => d?.msg || 'Invalid value').join('\n');
    }
  }
  return 'Unknown error occurred';
}

interface ScoredJob {
  id: string | number;
  title: string;
  company?: string;
  company_name?: string;
  location?: string;
  job_type?: string;
  salary?: string;
  salary_description?: string;
  skills?: string | string[];
  description?: string;
  matchScore: number;
  match_percentage: number;
  matchedSkillsList: string[];
  parsedSkills: string[];
  [key: string]: any;
}

/** Pure helper to score and pre-parse jobs with zero render-time allocations */
function scoreAndFormatJobs(
  jobs: any[],
  skillsList: string[],
  keyword: string
): ScoredJob[] {
  const lowerSkills = skillsList.map(s => s.toLowerCase().trim()).filter(Boolean);
  const keywordLower = (keyword || "").toLowerCase().trim();

  return jobs.map(job => {
    const jobText = `${job.title || ''} ${job.description || ''} ${Array.isArray(job.skills) ? job.skills.join(' ') : (job.skills || '')}`.toLowerCase();
    const matches = lowerSkills.filter(s => jobText.includes(s));
    const keywordBonus = keywordLower && jobText.includes(keywordLower) ? 2 : 0;
    const score = matches.length + keywordBonus;
    const pct = job.match_percentage
      ? Math.round(Number(job.match_percentage))
      : (score > 0 ? Math.min(99, 70 + score * 5) : 65);

    const rawSkills = job.skills;
    let parsedSkills: string[] = [];
    if (Array.isArray(rawSkills)) {
      parsedSkills = rawSkills;
    } else if (typeof rawSkills === 'string' && rawSkills.trim()) {
      parsedSkills = rawSkills.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    return {
      ...job,
      matchedSkillsList: matches,
      matchScore: score,
      match_percentage: pct,
      parsedSkills,
    };
  });
}

const JobSearchConfig = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [allVerifiedJobs, setAllVerifiedJobs] = useState<any[]>([]);
  const [matchedJobs, setMatchedJobs] = useState<ScoredJob[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [minMatchPercentage, setMinMatchPercentage] = useState<number>(60);

  // Initialize config with localStorage persistence fallback
  const [searchConfig, setSearchConfig] = useState(() => {
    const p = getCandidateProfile();
    try {
      const saved = localStorage.getItem('jobSearchConfig');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          keywords: parsed.keywords ?? (p.headline || ""),
          location: parsed.location ?? (p.location || "Remote"),
          skills: parsed.skills ?? (p.skills_string || ""),
          jobType: parsed.jobType ?? "Full-time",
          experienceLevel: parsed.experienceLevel ?? "Mid-level",
          salaryRange: parsed.salaryRange ?? "Any",
          maxJobs: parsed.maxJobs ?? 15,
          maxApplications: parsed.maxApplications ?? 5,
          autoApply: parsed.autoApply ?? true,
          similarityThreshold: parsed.similarityThreshold ?? 0.6
        };
      }
    } catch {
      // Fallback on corrupt storage
    }
    return {
      keywords: p.headline || "",
      location: p.location || "Remote",
      skills: p.skills_string || "",
      jobType: "Full-time",
      experienceLevel: "Mid-level",
      salaryRange: "Any",
      maxJobs: 15,
      maxApplications: 5,
      autoApply: true,
      similarityThreshold: 0.6
    };
  });

  // Fast O(1) applied lookup Set
  const appliedJobIdsSet = useMemo(() => new Set(appliedJobIds), [appliedJobIds]);

  // Synchronous unified threshold updater (eliminates double re-rendering on slider movement)
  const handleThresholdChange = useCallback((val: number) => {
    setMinMatchPercentage(val);
    setSearchConfig(prev => ({
      ...prev,
      similarityThreshold: val / 100
    }));
  }, []);

  // Filter suitable jobs dynamically based on match percentage threshold
  const jobsFilteredByPercentage = useMemo(() => {
    return matchedJobs.filter(job => job.match_percentage >= minMatchPercentage);
  }, [matchedJobs, minMatchPercentage]);

  // Modal state for Job Details & Manual Application
  const [selectedJobForModal, setSelectedJobForModal] = useState<ScoredJob | null>(null);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [candidateModalForm, setCandidateModalForm] = useState({
    name: "",
    email: "",
    phone: "",
    education: "",
    qualification: "",
    jobRole: "",
    coverLetter: "",
  });
  const [submittingModalApp, setSubmittingModalApp] = useState(false);

  const handleOpenApplyModal = (job: ScoredJob) => {
    const cached = getCandidateProfile();
    const userEmail = (localStorage.getItem("candidate_email") || localStorage.getItem("user_email") || cached.email || "").trim();
    const userName = (cached.candidate_name || localStorage.getItem("candidate_name") || "").trim();
    const userPhone = (cached.phone || localStorage.getItem("candidate_phone") || "").trim();
    setCandidateModalForm({
      name: userName || "Candidate",
      email: userEmail,
      phone: userPhone,
      education: "Bachelor of Technology in Computer Science",
      qualification: "B.Tech CSE / Graduate",
      jobRole: cached.headline || "Full Stack Software Engineer",
      coverLetter: `Dear Hiring Team at ${job.company_name || job.company},\n\nI am excited to apply for the ${job.title} position. With my background and relevant skills, I am confident in adding significant value to your team.\n\nBest regards,\n${userName || "Candidate"}`,
    });
    setIsApplyModalOpen(true);
  };

  const handleModalSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobForModal) return;
    setSubmittingModalApp(true);
    try {
      const jid = String(selectedJobForModal.id);
      await applicationService.saveClientApplication({
        id: selectedJobForModal.id,
        title: selectedJobForModal.title,
        company: selectedJobForModal.company_name || selectedJobForModal.company,
        location: selectedJobForModal.location,
        match_score: selectedJobForModal.match_percentage,
        url: '/candidate/jobs',
        candidate_name: candidateModalForm.name,
        candidate_email: candidateModalForm.email,
        candidate_phone: candidateModalForm.phone,
      });

      try {
        await apiClient.post(API_ENDPOINTS.recruiter.applyJob(Number(selectedJobForModal.id)), {
          cover_letter: candidateModalForm.coverLetter,
          candidate_name: candidateModalForm.name,
          candidate_email: candidateModalForm.email,
          candidate_phone: candidateModalForm.phone,
        });
      } catch (err) {
        console.debug("Backend direct apply note:", err);
      }

      setAppliedJobIds(prev => [...prev, jid]);
      setIsApplyModalOpen(false);
      toast({
        title: "Application Submitted Successfully! 🎉",
        description: `Your application for ${selectedJobForModal.title} has been submitted to ${selectedJobForModal.company_name || selectedJobForModal.company}.`,
      });
    } catch (err: any) {
      toast({
        title: "Submission Error",
        description: err?.message || "Could not submit application",
        variant: "destructive",
      });
    } finally {
      setSubmittingModalApp(false);
    }
  };

  const loadVerifiedJobs = useCallback(async () => {
    try {
      const resp = await apiClient.get(API_ENDPOINTS.recruiter.candidateJobs);
      const jobs = resp.data || [];
      setAllVerifiedJobs(jobs);

      const cached = getCandidateProfile();
      const skills = cached.skills?.length ? cached.skills : (searchConfig.skills ? searchConfig.skills.split(',').map((s: string) => s.trim()) : []);
      const kw = searchConfig.keywords || cached.headline || "";
      const scored = scoreAndFormatJobs(jobs, skills, kw);

      const fallbackJobs = jobs.slice(0, 10).map((j: any) => ({
        ...j,
        matchScore: 1,
        match_percentage: j.match_percentage ? Math.round(Number(j.match_percentage)) : 75,
        matchedSkillsList: [],
        parsedSkills: Array.isArray(j.skills) ? j.skills : (typeof j.skills === 'string' ? j.skills.split(',').map((s: string) => s.trim()) : [])
      }));

      setMatchedJobs(scored.length > 0 ? scored : fallbackJobs);
      setHasAnalyzed(true);
    } catch (e) {
      console.warn("Could not load candidate jobs for matching", e);
    }
  }, [searchConfig.keywords, searchConfig.skills]);

  useEffect(() => {
    loadVerifiedJobs();
  }, [loadVerifiedJobs]);

  const handleAnalyzeResume = async () => {
    if (!resumeFile) {
      toast({
        title: "Resume Required",
        description: "Please upload your resume first to analyze skills and identify suitable jobs.",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const uploadData = new FormData();
      uploadData.append('file', resumeFile);

      const resp = await apiClient.postFormData('/api/ats/parse-resume', uploadData);
      const res = resp.data || {};

      // Apply extracted details across entire candidate profile
      const updatedProfile = applyProfileFromResume(res, resumeFile.name);
      const parsed = res.parsed_data || {};
      const skills: string[] = updatedProfile.skills.length > 0 ? updatedProfile.skills : (parsed.skills || []);
      const contact = parsed.contact || {};
      const expList = parsed.experience || [];

      setExtractedSkills(skills);

      const skillsStr = skills.join(", ");
      let inferredKeywords = searchConfig.keywords;
      if (!inferredKeywords && updatedProfile.headline) {
        inferredKeywords = updatedProfile.headline;
      } else if (!inferredKeywords && expList.length > 0 && expList[0].title) {
        inferredKeywords = expList[0].title;
      }

      setSearchConfig(prev => ({
        ...prev,
        skills: skillsStr || prev.skills,
        keywords: inferredKeywords || prev.keywords,
        location: contact.city || contact.location || updatedProfile.location || prev.location,
      }));

      // Score and display suitable jobs
      const pool = allVerifiedJobs.length > 0 ? allVerifiedJobs : (res.matched_jobs || []);
      const scoredJobs = scoreAndFormatJobs(pool, skills, inferredKeywords)
        .filter(job => job.matchScore > 0 || !inferredKeywords)
        .sort((a, b) => b.matchScore - a.matchScore);

      const fallbackJobs = allVerifiedJobs.slice(0, 6).map(j => ({
        ...j,
        matchScore: 1,
        match_percentage: j.match_percentage ? Math.round(Number(j.match_percentage)) : 75,
        matchedSkillsList: [],
        parsedSkills: Array.isArray(j.skills) ? j.skills : (typeof j.skills === 'string' ? j.skills.split(',').map((s: string) => s.trim()) : [])
      }));

      setMatchedJobs(scoredJobs.length > 0 ? scoredJobs : fallbackJobs);
      setHasAnalyzed(true);

      toast({
        title: "✨ Resume Analyzed & Profile Updated!",
        description: `Extracted ${skills.length} skills. Found ${scoredJobs.length || fallbackJobs.length} suitable opportunities.`,
      });
    } catch (err: any) {
      toast({
        title: "Analysis Failed",
        description: err?.message || "Could not extract skills from resume.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeSearchDetails = () => {
    if (!searchConfig.keywords.trim() && !searchConfig.skills.trim()) {
      toast({
        title: "Details Required",
        description: "Please enter job keywords or skills, or upload your resume to analyze suitable jobs.",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    const userSkills = searchConfig.skills.split(',').map(s => s.trim()).filter(Boolean);
    const scored = scoreAndFormatJobs(allVerifiedJobs, userSkills, searchConfig.keywords)
      .filter(j => j.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);

    const fallbackJobs = allVerifiedJobs.slice(0, 6).map(j => ({
      ...j,
      matchScore: 1,
      match_percentage: j.match_percentage ? Math.round(Number(j.match_percentage)) : 75,
      matchedSkillsList: [],
      parsedSkills: Array.isArray(j.skills) ? j.skills : (typeof j.skills === 'string' ? j.skills.split(',').map((s: string) => s.trim()) : [])
    }));

    setMatchedJobs(scored.length > 0 ? scored : fallbackJobs);
    setHasAnalyzed(true);
    setIsAnalyzing(false);

    toast({
      title: "🔍 Criteria Analyzed!",
      description: `Found ${scored.length || fallbackJobs.length} suitable verified jobs matching your criteria.`,
    });
  };

  const handleQuickApply = async (job: ScoredJob) => {
    const jid = String(job.id);
    setApplyingJobId(jid);
    try {
      await applicationService.saveClientApplication({
        id: job.id,
        title: job.title,
        company: job.company_name || job.company,
        location: job.location,
        match_score: job.match_percentage,
        url: '/candidate/jobs',
      });
      setAppliedJobIds(prev => [...prev, jid]);
      toast({
        title: "Application Submitted & Stored! 🎉",
        description: `Application for ${job.title} at ${job.company_name || job.company} has been recorded.`,
      });
    } catch (err: any) {
      toast({
        title: "Application Error",
        description: err?.message || "Could not record application.",
        variant: "destructive"
      });
    } finally {
      setApplyingJobId(null);
    }
  };

  const handleChange = (field: string, value: any) => {
    setSearchConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file",
          variant: "destructive"
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Resume must be less than 10MB",
          variant: "destructive"
        });
        return;
      }
      setResumeFile(file);
      toast({
        title: "Resume uploaded",
        description: `${file.name} (${(file.size / 1024).toFixed(1)} KB). Click 'Analyze Resume' to auto-extract skills!`,
      });
    }
  };

  const handleRemoveResume = () => {
    setResumeFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStartAutomation = async () => {
    if (!resumeFile) {
      fileInputRef.current?.click();
      toast({
        title: "Resume PDF Required",
        description: "Please select your resume PDF to begin automated job matching and application.",
      });
      return;
    }

    if (!searchConfig.keywords.trim()) {
      toast({
        title: "Keywords required",
        description: "Please enter job keywords to search for",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      await jobService.runAgent({
        file: resumeFile,
        keyword: searchConfig.keywords,
        location: searchConfig.location,
        skills: searchConfig.skills,
        experience_level: searchConfig.experienceLevel,
        job_type: searchConfig.jobType,
        salary_range: searchConfig.salaryRange,
        max_jobs: searchConfig.maxJobs,
        max_applications: searchConfig.maxApplications,
        similarity_threshold: searchConfig.similarityThreshold,
        auto_apply: searchConfig.autoApply
      });

      toast({
        title: "Automation Started! 🚀",
        description: "Your automated job application agent is running. Redirecting to dashboard...",
      });

      setTimeout(() => {
        navigate('/dashboard');
      }, 800);
    } catch (error) {
      console.error('Error starting automation:', error);
      toast({
        title: "Failed to start automation",
        description: normalizeErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = () => {
    localStorage.setItem('jobSearchConfig', JSON.stringify(searchConfig));
    toast({
      title: "Configuration Saved",
      description: "Your search preferences will be remembered."
    });
  };

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Configure Job Search</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set up automated job matching and application criteria
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Resume Upload Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card variant="glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Resume Upload</CardTitle>
                <CardDescription>
                  Upload your resume (PDF only, max 10MB) for automated skill extraction
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {resumeFile ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-primary/10 border border-primary/20 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{resumeFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(resumeFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="hero"
                        size="sm"
                        onClick={handleAnalyzeResume}
                        disabled={isAnalyzing}
                        className="gap-2"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Analyze Resume</span>
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleRemoveResume}
                        title="Remove resume"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-28 border-dashed hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <Upload className="w-6 h-6 text-primary" />
                      <p className="font-medium text-sm">Click to upload your resume</p>
                      <p className="text-xs text-muted-foreground">PDF format, up to 10MB</p>
                    </div>
                  </Button>
                )}

                {/* Extracted Skills Preview */}
                {extractedSkills.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-foreground flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        {extractedSkills.length} Skills Extracted from Resume
                      </span>
                      <span className="text-muted-foreground">Auto-applied to job search</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {extractedSkills.map((skill, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Search Criteria Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Card variant="glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Search Criteria</CardTitle>
                <CardDescription>
                  Define the role preferences and filters for automated job discovery
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="keywords">Job Title / Keywords *</Label>
                  <div className="relative mt-1.5">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="keywords"
                      placeholder="e.g., Python Developer, Data Scientist"
                      value={searchConfig.keywords}
                      onChange={(e) => handleChange('keywords', e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="location">Location</Label>
                  <div className="relative mt-1.5">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="location"
                      placeholder="e.g., Remote, San Francisco, New York"
                      value={searchConfig.location}
                      onChange={(e) => handleChange('location', e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="skills">Skills (optional)</Label>
                  <Textarea
                    id="skills"
                    placeholder="e.g., Python, React, Machine Learning, AWS"
                    value={searchConfig.skills}
                    onChange={(e) => handleChange('skills', e.target.value)}
                    className="mt-1.5 resize-none"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="jobType">Job Type</Label>
                    <Select
                      value={searchConfig.jobType}
                      onValueChange={(value) => handleChange('jobType', value)}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Full-time">Full-time</SelectItem>
                        <SelectItem value="Part-time">Part-time</SelectItem>
                        <SelectItem value="Contract">Contract</SelectItem>
                        <SelectItem value="Internship">Internship</SelectItem>
                        <SelectItem value="Any">Any</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="experienceLevel">Experience Level</Label>
                    <Select
                      value={searchConfig.experienceLevel}
                      onValueChange={(value) => handleChange('experienceLevel', value)}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Entry-level">Entry-level</SelectItem>
                        <SelectItem value="Mid-level">Mid-level</SelectItem>
                        <SelectItem value="Senior">Senior</SelectItem>
                        <SelectItem value="Lead">Lead</SelectItem>
                        <SelectItem value="Any">Any</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="maxJobs">Max Jobs to Analyze</Label>
                    <Input
                      id="maxJobs"
                      type="number"
                      min="1"
                      max="50"
                      value={searchConfig.maxJobs}
                      onChange={(e) => handleChange('maxJobs', parseInt(e.target.value) || 1)}
                      className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Target volume of jobs to collect and score
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="maxApplications">Max Applications</Label>
                    <Input
                      id="maxApplications"
                      type="number"
                      min="1"
                      max="20"
                      value={searchConfig.maxApplications}
                      onChange={(e) => handleChange('maxApplications', parseInt(e.target.value) || 1)}
                      className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Max submissions per automated run
                    </p>
                  </div>
                </div>

                {/* Auto-Apply Toggle */}
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-muted/20">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoApply" className="text-sm font-medium cursor-pointer">
                      Automated Quick Apply
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Enable autonomous submission to matching Easy Apply roles
                    </p>
                  </div>
                  <Switch
                    id="autoApply"
                    checked={searchConfig.autoApply}
                    onCheckedChange={(checked) => handleChange('autoApply', checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Dynamic Match Percentage Slider Bar */}
          <Card className="border border-primary/25 shadow-sm bg-gradient-to-r from-card/90 via-card/60 to-primary/[0.04] backdrop-blur-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-base">
                    <Sliders className="w-4 h-4 text-primary" />
                    <span>Match Percentage Adjustment Bar</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Slide to dynamically adjust the compatibility threshold and discover matching jobs.
                  </p>
                </div>

                {/* Threshold indicator badge */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-xs text-muted-foreground">Threshold:</span>
                  <Badge
                    className={`text-xs px-3 py-1 font-bold ${minMatchPercentage >= 90
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
                    onChange={(e) => handleThresholdChange(Number(e.target.value))}
                    className="w-full h-2.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
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
                    onClick={() => handleThresholdChange(preset.val)}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${minMatchPercentage === preset.val
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Suitable Jobs Container */}
          <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-950/20 via-background to-purple-950/20 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2 text-indigo-400">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    Jobs Suitable for Your Profile
                  </CardTitle>
                  <CardDescription>
                    Curated verified job openings matching your analyzed resume skills & parameters
                  </CardDescription>
                </div>
                {hasAnalyzed ? (
                  <Badge variant="outline" className="border-indigo-500/30 text-indigo-300">
                    {jobsFilteredByPercentage.length} {jobsFilteredByPercentage.length === 1 ? 'Match' : 'Matches'} Found
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-300">
                    Analysis Required
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasAnalyzed ? (
                /* Gated State: Analysis prompt */
                <div className="text-center py-10 px-6 rounded-2xl border border-dashed border-indigo-500/20 bg-indigo-950/10 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
                    <Search className="w-6 h-6" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="font-semibold text-foreground text-base">
                      Jobs Hidden Until Details Are Analyzed
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Upload your resume or specify keywords and click <strong>"Analyze"</strong> below to view compatible openings.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    {resumeFile ? (
                      <Button
                        variant="hero"
                        size="sm"
                        onClick={handleAnalyzeResume}
                        disabled={isAnalyzing}
                        className="gap-2 shadow-md shadow-indigo-600/20"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Analyzing Resume...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Analyze Resume to View Suitable Jobs</span>
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="gap-2 border-indigo-500/30 hover:bg-indigo-500/10"
                      >
                        <Upload className="w-4 h-4 text-indigo-400" />
                        <span>Upload Resume to Analyze</span>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAnalyzeSearchDetails}
                      disabled={isAnalyzing}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Analyze by Keywords & Skills
                    </Button>
                  </div>
                </div>
              ) : jobsFilteredByPercentage.length > 0 ? (
                /* Post-Analysis: Render qualified jobs */
                <div className="grid grid-cols-1 gap-3">
                  {jobsFilteredByPercentage.map((job) => {
                    const isApplied = appliedJobIdsSet.has(String(job.id));
                    const isApplying = applyingJobId === String(job.id);
                    return (
                      <div
                        key={job.id}
                        className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-foreground text-base truncate">{job.title}</h4>
                            {job.job_type && (
                              <Badge variant="secondary" className="text-xs bg-indigo-500/20 text-indigo-300 border-none">
                                {job.job_type}
                              </Badge>
                            )}
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[11px]">
                              {job.match_percentage}% Suitable Match
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {job.company_name || job.company} &bull; {job.location || 'Remote'} &bull; <span className="text-emerald-400">{job.salary_description || job.salary || 'Competitive'}</span>
                          </p>

                          {job.parsedSkills.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {job.parsedSkills.slice(0, 6).map((skill, idx) => (
                                <Badge key={idx} variant="outline" className="text-[11px] py-0 px-2 bg-black/20 text-indigo-200 border-indigo-500/30">
                                  {skill}
                                </Badge>
                              ))}
                              {job.parsedSkills.length > 6 && (
                                <span className="text-[11px] text-muted-foreground self-center">
                                  +{job.parsedSkills.length - 6} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isApplied ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 gap-1.5 text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Applied & Stored
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleOpenApplyModal(job)}
                              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/25 gap-1.5 font-semibold text-xs h-9 px-3.5"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>Apply</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenApplyModal(job)}
                            className="border-white/10 hover:bg-white/5 text-xs h-9"
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 px-4 rounded-xl border border-dashed border-white/10 bg-black/20">
                  <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium text-foreground">No matches found at {minMatchPercentage}% threshold</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Try lowering the match percentage slider above or adjusting your search criteria to uncover more opportunities.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Summary & Actions */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Card variant="glow">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Ready to Start?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Resume:</span>
                    {resumeFile ? (
                      <span className="font-medium text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Ready
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-amber-400 hover:text-amber-300 font-medium underline flex items-center gap-1 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload PDF (Required)
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Searching for:</span>
                    <span className="font-medium truncate max-w-[150px]">{searchConfig.keywords || "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">{searchConfig.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Auto-Apply:</span>
                    <span className="font-medium">{searchConfig.autoApply ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max Applications:</span>
                    <span className="font-medium">{searchConfig.maxApplications}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Match Threshold:</span>
                    <span className="font-medium">{Math.round(searchConfig.similarityThreshold * 100)}%</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-3">
                  <Button
                    variant="hero"
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 h-12 gap-2 text-sm sm:text-base"
                    size="lg"
                    onClick={() => {
                      if (jobsFilteredByPercentage.length > 0) {
                        handleOpenApplyModal(jobsFilteredByPercentage[0]);
                      } else if (matchedJobs.length > 0) {
                        handleOpenApplyModal(matchedJobs[0]);
                      } else if (allVerifiedJobs.length > 0) {
                        handleOpenApplyModal(allVerifiedJobs[0]);
                      } else {
                        handleAnalyzeSearchDetails();
                      }
                    }}
                  >
                    <Zap className="w-5 h-5 mr-1" />
                    Apply to Matched Jobs ({jobsFilteredByPercentage.length})
                  </Button>
                  <p className="text-[11px] text-center text-muted-foreground">
                    Click Apply to view job details and submit your application with your profile.
                  </p>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleSaveConfig}
                  >
                    <Save className="w-4 h-4 mr-1.5" />
                    Save Configuration
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* How it works info card */}
          <motion.div
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">How it works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                    1
                  </div>
                  <p>Upload your resume and configure search criteria</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                    2
                  </div>
                  <p>Agent accesses jobs via verified autonomous browser session</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                    3
                  </div>
                  <p>Searches for jobs with Easy Apply filter enabled</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                    4
                  </div>
                  <p>AI analyzes each job and matches with your resume</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                    5
                  </div>
                  <p>Automatically applies to matched Easy Apply jobs</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* POPUP: JOB POST DETAILS & CLIENT PROFILE APPLICATION MODAL              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={isApplyModalOpen} onOpenChange={setIsApplyModalOpen}>
        <DialogContent className="max-w-2xl bg-card border-white/10 text-foreground max-h-[90vh] overflow-y-auto">
          {selectedJobForModal && (
            <form onSubmit={handleModalSubmitApplication} className="space-y-5">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-blue-500/20 border border-primary/30 flex items-center justify-center font-bold text-lg text-primary shrink-0">
                    {selectedJobForModal.company_name ? selectedJobForModal.company_name[0].toUpperCase() : "J"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <DialogTitle className="text-xl font-bold">{selectedJobForModal.title}</DialogTitle>
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">
                        {selectedJobForModal.match_percentage}% Suitable Match
                      </Badge>
                    </div>
                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                      {selectedJobForModal.company_name || selectedJobForModal.company} &bull; {selectedJobForModal.location || "Remote"} &bull; <span className="text-emerald-400">{selectedJobForModal.salary_description || selectedJobForModal.salary || "Competitive"}</span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Job Specification Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-mono">Job Type</span>
                  <span className="font-semibold text-foreground">{selectedJobForModal.job_type || "Full-time"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-mono">Compensation</span>
                  <span className="font-semibold text-emerald-400">{selectedJobForModal.salary_description || selectedJobForModal.salary || "Competitive"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-mono">Location</span>
                  <span className="font-semibold text-foreground">{selectedJobForModal.location || "Remote"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-mono">Compatibility</span>
                  <span className="font-semibold text-primary">{selectedJobForModal.match_percentage}% Fit</span>
                </div>
              </div>

              {/* Job Description & Requirements */}
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground block">
                  Job Description & Scope
                </span>
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs text-muted-foreground leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap">
                  {selectedJobForModal.description || "Exciting opportunity to build cutting-edge software solutions."}
                </div>
              </div>

              {selectedJobForModal.parsedSkills && selectedJobForModal.parsedSkills.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-muted-foreground block">
                    Required Technical Skills
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedJobForModal.parsedSkills.map((sk: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs bg-indigo-500/10 text-indigo-300 border-indigo-500/30">
                        {sk}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Client Profile Details Section */}
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Your Application Profile (Auto-Prefilled)
                  </span>
                  <span className="text-[11px] text-muted-foreground">Editable before submission</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Full Name *</Label>
                    <Input
                      value={candidateModalForm.name}
                      onChange={(e) => setCandidateModalForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Verified Email *</Label>
                    <Input
                      type="email"
                      value={candidateModalForm.email}
                      onChange={(e) => setCandidateModalForm(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Mobile Number *</Label>
                    <Input
                      value={candidateModalForm.phone}
                      onChange={(e) => setCandidateModalForm(prev => ({ ...prev, phone: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Current Job Role / Designation</Label>
                    <Input
                      value={candidateModalForm.jobRole}
                      onChange={(e) => setCandidateModalForm(prev => ({ ...prev, jobRole: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Education Degree & College</Label>
                    <Input
                      value={candidateModalForm.education}
                      onChange={(e) => setCandidateModalForm(prev => ({ ...prev, education: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Qualification</Label>
                    <Input
                      value={candidateModalForm.qualification}
                      onChange={(e) => setCandidateModalForm(prev => ({ ...prev, qualification: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium mb-1 block">Cover Letter / Note to Recruiter</Label>
                  <Textarea
                    rows={3}
                    value={candidateModalForm.coverLetter}
                    onChange={(e) => setCandidateModalForm(prev => ({ ...prev, coverLetter: e.target.value }))}
                    className="resize-none text-xs"
                  />
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsApplyModalOpen(false)}
                  disabled={submittingModalApp}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingModalApp}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                >
                  {submittingModalApp ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Submit Application</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobSearchConfig;
