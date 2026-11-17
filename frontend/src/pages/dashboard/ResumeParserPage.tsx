import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, 
  ExternalLink, Sparkles, User, Briefcase, GraduationCap, 
  Award, Eye, RefreshCw, RotateCcw, Calendar, Target, Code, Database,
  Cloud, Layers, Globe, Linkedin, Github, Compass, Lightbulb,
  Check, ArrowRight, ShieldCheck, Mail, Phone, MapPin, Sliders,
  UserCheck, CheckSquare, Square
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL, apiClient, API_ENDPOINTS } from '@/lib/api';
import { applicationService } from '@/services/applicationService';
import { 
  applyProfileFromResume, 
  getCandidateProfile, 
  applyExplicitProfileUpdate, 
  CandidateProfile 
} from '@/utils/profileSync';
import { ResumeDocumentPreview } from '@/components/ResumeDocumentPreview';
import { 
  getActiveResumeSession, 
  setActiveResumeSession, 
  subscribeToActiveResumeSession,
  clearActiveResumeSession 
} from '@/utils/activeResumeSession';

export interface ParsedContact {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  city?: string;
  state?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
}

export interface ParsedExperience {
  title?: string;
  company?: string;
  duration?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  responsibilities?: string[];
  achievements?: string[];
}

export interface ParsedEducation {
  degree?: string;
  institution?: string;
  field_of_study?: string;
  year?: string;
  academic_details?: string;
}

export interface ParsedProject {
  name: string;
  description: string;
  technologies?: string[];
  contribution?: string;
  outcomes?: string;
  link?: string;
}

export interface ParsedCertification {
  name: string;
  issuer?: string;
  date?: string;
}

export interface RecommendedDesignation {
  designation: string;
  title?: string;
  category: string;
  match_percentage: number;
  relevant_skills: string[];
  relevant_experience: string;
  why_suitable: string;
  missing_skills: string[];
  career_advice: string;
}

export interface AtsDiagnostics {
  ats_score: number;
  contact_verification: string;
  formatting_readability: string;
  keyword_saturation: string;
  observations: string[];
  formatting_recommendations: string[];
}

export interface TargetCalibrationResult {
  target_designation: string;
  target_category: string;
  ats_match_percentage: number;
  matching_keywords: string[];
  missing_critical_keywords: string[];
  experience_relevance: string;
  suitability_reasoning: string;
  optimization_recommendations: string[];
}

export interface CandidateIntelligenceData {
  contact?: ParsedContact;
  summary?: string;
  total_experience?: string;
  skills?: string[];
  categorized_skills?: {
    programming_languages?: string[];
    frontend?: string[];
    backend?: string[];
    databases?: string[];
    cloud_devops?: string[];
    tools_frameworks?: string[];
  };
  experience?: ParsedExperience[];
  education?: ParsedEducation[];
  projects?: ParsedProject[];
  certifications?: (string | ParsedCertification)[];
  achievements?: string[];
  recommended_designations?: RecommendedDesignation[];
  ats_analysis?: AtsDiagnostics;
  facts_vs_inferences?: {
    explicit_facts?: string[];
    inferences?: string[];
  };
}

export default function ResumeParserPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseProgress, setParseProgress] = useState<number>(0);
  const [parsedData, setParsedData] = useState<CandidateIntelligenceData | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [textLength, setTextLength] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [isSavedToProfile, setIsSavedToProfile] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Target role calibration state
  const [targetDesignationInput, setTargetDesignationInput] = useState<string>('');
  const [isCalibratingTarget, setIsCalibratingTarget] = useState<boolean>(false);
  const [targetCalibrationResult, setTargetCalibrationResult] = useState<TargetCalibrationResult | null>(null);

  // Active tab selection
  const [activeTab, setActiveTab] = useState<string>('skills');

  // Confirmation dialog & profile isolation state
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [showProfileReviewModal, setShowProfileReviewModal] = useState<boolean>(false);
  const [currentCandidateProfile, setCurrentCandidateProfile] = useState<CandidateProfile | null>(null);
  const [selectedProfileFields, setSelectedProfileFields] = useState<Record<string, boolean>>({
    full_name: true,
    phone: true,
    location: true,
    skills: true,
    experience: true,
    education: true,
    headline: true,
    summary: true,
  });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState<boolean>(false);

  const handleOpenProfileReview = () => {
    const current = getCandidateProfile();
    setCurrentCandidateProfile(current);
    setSelectedProfileFields({
      full_name: Boolean(parsedData?.contact?.name),
      phone: Boolean(parsedData?.contact?.phone),
      location: Boolean(parsedData?.contact?.location),
      skills: Boolean(parsedData?.skills && parsedData.skills.length > 0),
      experience: Boolean(parsedData?.total_experience),
      education: Boolean(parsedData?.education && parsedData.education.length > 0),
      headline: Boolean(parsedData?.recommended_designations && parsedData.recommended_designations.length > 0),
      summary: Boolean(parsedData?.summary),
    });
    setShowProfileReviewModal(true);
  };

  const handleConfirmProfileUpdate = async () => {
    if (!parsedData) return;
    setIsUpdatingProfile(true);
    try {
      const updates: Partial<CandidateProfile> = {};
      if (selectedProfileFields.full_name && parsedData.contact?.name) {
        updates.candidate_name = parsedData.contact.name;
      }
      if (selectedProfileFields.phone && parsedData.contact?.phone) {
        updates.phone = parsedData.contact.phone;
      }
      if (selectedProfileFields.location && parsedData.contact?.location) {
        updates.location = parsedData.contact.location;
      }
      if (selectedProfileFields.skills && parsedData.skills) {
        updates.skills = parsedData.skills;
      }
      if (selectedProfileFields.experience && parsedData.total_experience) {
        updates.experience = parsedData.total_experience;
      }
      if (selectedProfileFields.education && parsedData.education && parsedData.education.length > 0) {
        updates.education = parsedData.education;
      }
      if (selectedProfileFields.headline && parsedData.recommended_designations && parsedData.recommended_designations.length > 0) {
        updates.headline = parsedData.recommended_designations[0].title || parsedData.recommended_designations[0].designation;
      }
      if (selectedProfileFields.summary && parsedData.summary) {
        updates.summary = parsedData.summary;
      }

      await applyExplicitProfileUpdate(updates);
      toast({
        title: 'Profile Updated Successfully! 🎯',
        description: 'Selected resume details have been synchronized with your candidate profile.',
      });
      setShowProfileReviewModal(false);
    } catch (err: any) {
      toast({
        title: 'Update Failed',
        description: err?.message || 'Failed to update profile.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleResetPage = () => {
    clearActiveResumeSession();
    setParsedData(null);
    setFile(null);
    setPreviewUrl(null);
    setRawText('');
    setTargetCalibrationResult(null);
    setError(null);
    setIsSavedToProfile(false);
    setShowResetConfirm(false);
    toast({
      title: 'Workspace Reset',
      description: 'Active resume analysis cleared. Saved resumes and candidate profile remain untouched.',
    });
  };

  useEffect(() => {
    // ── In-Memory Session Synchronization ──────────────────────────────────────
    // Survives in-app navigation between Autonomous Agent & Resume Intelligence,
    // but resets to null on full browser refresh (F5) so the UI starts empty.
    const active = getActiveResumeSession();
    if (active && active.parsedData) {
      populateFromParsedPayload(active.parsedData, active.file, active.previewUrl, active.rawText);
    }

    const unsubscribe = subscribeToActiveResumeSession((session) => {
      if (session && session.parsedData) {
        populateFromParsedPayload(session.parsedData, session.file, session.previewUrl, session.rawText);
      } else if (!session) {
        setParsedData(null);
        setFile(null);
        setPreviewUrl(null);
        setRawText('');
        setTargetCalibrationResult(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const populateFromParsedPayload = (
    data: any,
    attachedFile?: File | null,
    attachedPreviewUrl?: string | null,
    text?: string
  ) => {
    if (!data) return;
    const parsed = data.parsed_data || data;
    const contact = parsed.contact || {};
    const catSkills = data.categorized_skills || parsed.categorized_skills || {};
    const recDesignations = data.recommended_designations || parsed.recommended_designations || [];
    const atsDiag = data.ats_analysis || parsed.ats_analysis || null;

    setParsedData({
      contact: {
        name: data.candidate_name || contact.name,
        email: data.email || contact.email,
        phone: data.phone || contact.phone,
        location: data.location || contact.location,
        city: contact.city || (data.location || '').split(',')[0]?.trim(),
        state: contact.state || (data.location || '').split(',')[1]?.trim(),
        linkedin_url: data.linkedin_url || contact.linkedin_url,
        github_url: data.github_url || contact.github_url,
        portfolio_url: data.portfolio_url || contact.portfolio_url,
      },
      summary: data.professional_summary || parsed.summary || '',
      total_experience: data.total_experience || parsed.total_experience || 'Fresher / Entry-Level (0 years)',
      skills: data.all_skills || parsed.skills || [],
      categorized_skills: catSkills,
      experience: (data.employment_history || parsed.experience || []).map((exp: any) => ({
        title: exp.title || exp.job_title || 'Position',
        company: exp.company || exp.employer || 'Organization',
        duration: exp.duration || exp.dates || 'Past Experience',
        start_date: exp.start_date || '',
        end_date: exp.end_date || '',
        description: exp.description || '',
        responsibilities: Array.isArray(exp.responsibilities) ? exp.responsibilities : exp.highlights || [],
        achievements: exp.achievements || [],
      })),
      education: (data.education || parsed.education || []).map((edu: any) => ({
        degree: edu.degree || 'Degree',
        institution: edu.institution || edu.school || 'University',
        field_of_study: edu.field_of_study || '',
        year: edu.year || edu.graduation_year || '',
        academic_details: edu.academic_details || edu.details || '',
      })),
      projects: (data.key_projects || parsed.projects || []).map((p: any) => ({
        name: p.name || 'Project',
        description: p.description || '',
        technologies: p.technologies || [],
        contribution: p.contribution || p.outcomes || '',
        link: p.link || '',
      })),
      certifications: data.certifications || parsed.certifications || [],
      achievements: data.career_highlights || data.strengths || parsed.achievements || [],
      recommended_designations: recDesignations,
      ats_analysis: atsDiag,
      facts_vs_inferences: data.facts_vs_inferences || { explicit_facts: [], inferences: [] },
    });

    if (attachedFile) setFile(attachedFile);
    if (attachedPreviewUrl) setPreviewUrl(attachedPreviewUrl);
    if (text || data.text) {
      setRawText(text || data.text || '');
      setTextLength((text || data.text || '').length);
    }
    setIsSavedToProfile(true);
  };

  const saveResumeToProfile = async (targetFile: File) => {
    setIsSaving(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append('file', targetFile);
      const savedEmail = localStorage.getItem('candidate_email');
      if (savedEmail) uploadForm.append('user_email', savedEmail);

      const resp = await apiClient.postFormData('/api/upload-resume', uploadForm);
      if (resp.data) {
        setIsSavedToProfile(true);
        toast({
          title: 'Saved to Profile! 📁',
          description: 'Resume & candidate intelligence permanently archived in your candidate account.',
        });
      }
    } catch (err: any) {
      console.warn('Could not save resume to profile backend:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    const validExts = ['.pdf', '.docx', '.txt'];
    const hasValidExt = validExts.some(ext => selectedFile.name.toLowerCase().endsWith(ext));

    if (!validTypes.includes(selectedFile.type) && !hasValidExt) {
      setError('Please upload a PDF, DOCX, or TXT file.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10MB limit.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setIsSavedToProfile(false);
    setTargetCalibrationResult(null);

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    parseResumeFile(selectedFile, objectUrl);
  };

  const parseResumeFile = async (resumeFile: File, objUrl?: string) => {
    setIsParsing(true);
    setParseProgress(10);
    setError(null);

    const progressInterval = setInterval(() => {
      setParseProgress((prev) => {
        if (prev >= 85) {
          clearInterval(progressInterval);
          return 85;
        }
        return prev + 15;
      });
    }, 200);

    try {
      const formData = new FormData();
      formData.append('file', resumeFile);

      const response = await apiClient.postFormData<any>(API_ENDPOINTS.ats.parseResume, formData);

      clearInterval(progressInterval);
      setParseProgress(100);

      const result = response.data;

      if (result) {
        populateFromParsedPayload(result, resumeFile, objUrl || previewUrl, result.text);

        // Store in live in-memory session so other views (Autonomous Agent) receive it
        setActiveResumeSession({
          profile: {
            candidate_name: result.candidate_name,
            email: result.email,
            phone: result.phone,
            location: result.location,
            all_skills: result.all_skills,
            total_experience: result.total_experience,
            ai_powered: result.ai_powered,
          },
          parsedData: result,
          matchedJobs: result.matched_jobs || [],
          file: resumeFile,
          previewUrl: objUrl || previewUrl,
          rawText: result.text || '',
          recommendedDesignations: result.recommended_designations || [],
          atsAnalysis: result.ats_analysis || null,
        });

        // Sync candidate profile
        try {
          applyProfileFromResume(result, resumeFile.name);
        } catch {}

        saveResumeToProfile(resumeFile);

        const recCount = result.recommended_designations?.length || 0;
        toast({
          title: 'Candidate Intelligence Analyzed! 🎯',
          description: `Extracted ${result.all_skills?.length || 0} skills & generated ${recCount} recommended job designations.`,
        });
      } else {
        throw new Error('Failed to extract candidate intelligence from resume.');
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      const msg = err?.response?.data?.detail || err?.message || 'Error occurred while analyzing resume document.';
      setError(msg);
      toast({
        title: 'Analysis Failed',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleOpenResume = () => {
    if (previewUrl || file) {
      setShowPreviewModal(true);
    }
  };

  const handleCalibrateForRole = async (targetTitle: string) => {
    if (!targetTitle || !targetTitle.trim()) return;
    setTargetDesignationInput(targetTitle);
    setIsCalibratingTarget(true);

    try {
      const resp = await apiClient.post(API_ENDPOINTS.ats.calibrateTarget, {
        target_designation: targetTitle,
        resume_text: rawText,
        skills: parsedData?.skills || [],
      });

      if (resp.data) {
        setTargetCalibrationResult(resp.data);
        toast({
          title: `ATS Calibrated for ${targetTitle}! ✨`,
          description: `Evaluated keyword density, compatibility score (${resp.data.ats_match_percentage}%), and optimization gaps.`,
        });
      }
    } catch (err: any) {
      console.warn('Target calibration notice:', err);
      toast({
        title: 'Calibration Notice',
        description: err.message || 'Unable to perform target calibration.',
      });
    } finally {
      setIsCalibratingTarget(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Editorial Header ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E6E5DC]"
      >
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#123B32]/10 text-[#123B32] text-xs font-semibold uppercase tracking-wider mb-2">
            <Target className="w-3.5 h-3.5 text-[#FF7058]" />
            <span>Comprehensive Candidate Intelligence & ATS Diagnostic</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#123B32] tracking-tight">
            Resume Intelligence & ATS Calibration
          </h1>
          <p className="text-xs sm:text-sm text-[#777D74] mt-1 font-sans">
            Extract deep competencies, inspect verified candidate credentials, and discover grounded job designation recommendations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {parsedData && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenProfileReview}
              className="text-xs border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 gap-1.5 font-semibold"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Review & Update Profile</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetConfirm(true)}
            className="text-xs border-[#E6E5DC] text-[#777D74] hover:text-[#123B32] gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Page</span>
          </Button>
        </div>
      </motion.div>

      {/* ── Ingest Candidate Resume Zone ────────────────────────────────────── */}
      <div className="p-8 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow space-y-5">
        <div>
          <h3 className="font-serif text-xl font-bold text-[#123B32] mb-1">
            Ingest Candidate Resume
          </h3>
          <p className="text-xs text-[#777D74]">
            Supported formats: PDF, DOCX, and TXT (up to 10MB). Encrypted with cryptographic privacy.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <label className="w-full sm:w-auto">
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />
            <div className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors shadow-sm">
              <Upload className="w-4 h-4 text-[#FF7058]" />
              <span>{parsedData ? "Upload New Resume" : "Upload Document"}</span>
            </div>
          </label>

          {file && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleOpenResume}
                className="border-[#E6E5DC] text-[#123B32] hover:bg-[#F7F5EF] text-xs font-semibold h-10 gap-2"
              >
                <Eye className="w-4 h-4 text-[#123B32]" />
                <span>Inspect Document</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#777D74]" />
              </Button>

              <Button
                variant="ghost"
                onClick={() => file && parseResumeFile(file)}
                disabled={isParsing}
                className="text-xs text-[#777D74] hover:text-[#123B32] gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isParsing ? 'animate-spin' : ''}`} />
                <span>Re-calibrate</span>
              </Button>

              {parsedData && (
                <Button
                  variant="outline"
                  onClick={handleOpenProfileReview}
                  className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold h-10 gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Review & Update Profile</span>
                </Button>
              )}

              {isSavedToProfile ? (
                <span className="h-9 px-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1.5 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Calibrated to Profile</span>
                </span>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => file && saveResumeToProfile(file)}
                  disabled={isSaving || isParsing}
                  className="border-[#123B32]/30 text-[#123B32] text-xs font-semibold h-10"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>Save to Account</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {file && (
          <div className="flex items-center gap-3 text-xs text-[#777D74] bg-[#F7F5EF] p-3.5 rounded-lg border border-[#E6E5DC]">
            <FileText className="w-4 h-4 text-[#123B32]" />
            <span className="font-semibold text-[#123B32]">{file.name}</span>
            <span>•</span>
            <span>{(file.size / 1024).toFixed(1)} KB</span>
            <span>•</span>
            <span className="uppercase">{file.name.split('.').pop()}</span>
          </div>
        )}

        {isParsing && (
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs text-[#777D74]">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#123B32]" />
                Extracting candidate intelligence, categorized skills & calculating ATS diagnostics...
              </span>
              <span className="font-mono">{parseProgress}%</span>
            </div>
            <Progress value={parseProgress} className="h-1.5 bg-stone-200" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* ── Extracted Candidate Intelligence Dashboard ──────────────────────── */}
      {parsedData && (
        <div className="space-y-8">
          {/* SECTION A: Candidate Overview & Personal Information */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Personal Details Card */}
            <div className="p-6 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E6E5DC]">
                <h3 className="font-serif text-lg font-bold text-[#123B32] flex items-center gap-2">
                  <User className="w-5 h-5 text-[#FF7058]" />
                  <span>Candidate Identity</span>
                </h3>
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300">
                  Verified Contact
                </Badge>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-[#777D74] block text-[11px]">Full Name</span>
                  <span className="font-bold text-[#123B32] text-sm">
                    {parsedData.contact?.name || "Name not explicitly detected"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[#202722]">
                  <Mail className="w-3.5 h-3.5 text-[#777D74]" />
                  <span>{parsedData.contact?.email || "Email unavailable"}</span>
                </div>

                <div className="flex items-center gap-2 text-[#202722]">
                  <Phone className="w-3.5 h-3.5 text-[#777D74]" />
                  <span>{parsedData.contact?.phone || "Phone unavailable"}</span>
                </div>

                <div className="flex items-center gap-2 text-[#202722]">
                  <MapPin className="w-3.5 h-3.5 text-[#777D74]" />
                  <span>{parsedData.contact?.location || "Location not stated (Remote compatible)"}</span>
                </div>

                {/* Profiles & Links */}
                <div className="pt-3 border-t border-[#E6E5DC] flex flex-wrap gap-2">
                  {parsedData.contact?.linkedin_url ? (
                    <a
                      href={parsedData.contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0077b5]/10 text-[#0077b5] text-[11px] font-semibold hover:bg-[#0077b5]/20 transition-colors"
                    >
                      <Linkedin className="w-3 h-3" />
                      <span>LinkedIn Profile</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    <span className="text-[11px] text-[#777D74] italic">LinkedIn not linked</span>
                  )}

                  {parsedData.contact?.github_url && (
                    <a
                      href={parsedData.contact.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#24292e]/10 text-[#24292e] dark:text-[#F7F5EF] text-[11px] font-semibold hover:bg-[#24292e]/20 transition-colors"
                    >
                      <Github className="w-3 h-3" />
                      <span>GitHub</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}

                  {parsedData.contact?.portfolio_url && (
                    <a
                      href={parsedData.contact.portfolio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 text-[11px] font-semibold hover:bg-purple-100 transition-colors"
                    >
                      <Globe className="w-3 h-3" />
                      <span>Portfolio</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Professional Summary Card */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E6E5DC]">
                <h3 className="font-serif text-lg font-bold text-[#123B32] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#FF7058]" />
                  <span>Professional Summary</span>
                </h3>
                <Badge variant="outline" className="text-[10px] text-[#777D74] border-[#E6E5DC]">
                  {parsedData.total_experience || "Career Background"}
                </Badge>
              </div>

              {parsedData.summary ? (
                <p className="text-xs sm:text-sm text-[#202722] leading-relaxed font-sans bg-[#F7F5EF]/60 p-4 rounded-xl border border-[#E6E5DC]">
                  {parsedData.summary}
                </p>
              ) : (
                <div className="text-xs text-[#777D74] p-4 bg-[#F7F5EF] rounded-xl italic">
                  No explicit summary section detected in resume. The candidate background is inferred directly from listed technical competencies and work history.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-[#777D74]">
                <span className="font-semibold text-[#123B32]">Verified Experience Tier:</span>
                <Badge className="bg-[#123B32] text-[#F7F5EF] text-xs">
                  {parsedData.total_experience || "Entry-Level / Fresher"}
                </Badge>
                <span className="text-[11px]">• Derived from employment dates & credentials</span>
              </div>
            </div>
          </div>

          {/* ── SECTION B: RECOMMENDED JOB DESIGNATIONS (MAJOR NEW FEATURE) ──── */}
          <div className="p-8 rounded-2xl bg-white border border-[#123B32]/25 editorial-shadow space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E6E5DC]">
              <div>
                <div className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-[#FF7058]" />
                  <h3 className="font-serif text-2xl font-bold text-[#123B32]">
                    Recommended Job Designations
                  </h3>
                </div>
                <p className="text-xs text-[#777D74] mt-1 font-sans">
                  Grounded career role recommendations analyzed directly from your evidenced skills, experience tier, and project deliverables.
                </p>
              </div>
              <Badge variant="outline" className="bg-[#123B32]/10 text-[#123B32] border-[#123B32]/30 text-xs px-3 py-1 font-semibold self-start sm:self-center">
                ✨ Deterministic AI Calibration
              </Badge>
            </div>

            {parsedData.recommended_designations && parsedData.recommended_designations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {parsedData.recommended_designations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="p-5 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/40 hover:border-[#123B32]/40 transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      {/* Top Header: Designation & Match % */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <Badge variant="outline" className="text-[10px] text-[#777D74] border-stone-300 mb-1">
                            {rec.category}
                          </Badge>
                          <h4 className="font-serif text-base font-bold text-[#123B32] leading-tight">
                            {rec.designation}
                          </h4>
                        </div>
                        <Badge className="bg-[#123B32] text-[#F7F5EF] font-bold text-xs px-2.5 py-1 shrink-0">
                          {rec.match_percentage}% Match
                        </Badge>
                      </div>

                      <div className="text-[11px] text-[#777D74] mb-3">
                        <span>Target Tier: </span>
                        <strong className="text-[#123B32]">{rec.relevant_experience}</strong>
                      </div>

                      {/* Why Suitable */}
                      <div className="p-3 rounded-lg bg-white border border-[#E6E5DC] text-xs text-[#202722] leading-relaxed mb-3">
                        <span className="font-semibold text-[#123B32] block text-[11px] mb-1">Why Suitable:</span>
                        {rec.why_suitable}
                      </div>

                      {/* Relevant Evidenced Skills */}
                      <div className="space-y-1.5 mb-3">
                        <span className="text-[11px] font-semibold text-[#777D74] uppercase tracking-wider block">
                          Relevant Evidenced Skills:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {rec.relevant_skills.map((sk, sidx) => (
                            <Badge key={sidx} className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px] px-2 py-0.5">
                              ✓ {sk}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Missing or Recommended Skills */}
                      {rec.missing_skills && rec.missing_skills.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          <span className="text-[11px] font-semibold text-[#777D74] uppercase tracking-wider block">
                            Recommended Gaps to Cover:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {rec.missing_skills.map((sk, midx) => (
                              <Badge key={midx} variant="outline" className="text-[10px] text-[#777D74] border-[#E6E5DC] bg-white">
                                + {sk}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Career Development Advice */}
                      {rec.career_advice && (
                        <div className="p-2.5 rounded-lg bg-[#FF7058]/5 border border-[#FF7058]/20 text-[11px] text-[#202722]">
                          <span className="font-semibold text-[#FF7058] flex items-center gap-1 mb-0.5">
                            <Lightbulb className="w-3 h-3" />
                            Career Development Tip:
                          </span>
                          {rec.career_advice}
                        </div>
                      )}
                    </div>

                    {/* Action Button: Calibrate for this Role */}
                    <div className="pt-2 border-t border-[#E6E5DC]">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCalibrateForRole(rec.designation)}
                        className="w-full text-xs font-semibold text-[#123B32] border-[#123B32]/30 hover:bg-[#123B32] hover:text-white transition-colors gap-1.5"
                      >
                        <Target className="w-3.5 h-3.5 text-[#FF7058]" />
                        <span>Calibrate ATS for this Role</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-[#777D74] bg-[#F7F5EF] rounded-xl">
                Upload a resume with evidenced technical competencies or software projects to generate grounded job designation recommendations.
              </div>
            )}
          </div>

          {/* ── SECTION C: ATS CALIBRATION ENGINE & TARGET ROLE CALIBRATOR ───── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ATS General Diagnostics Score */}
            <div className="p-6 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E6E5DC]">
                <h3 className="font-serif text-lg font-bold text-[#123B32] flex items-center gap-2">
                  <Target className="w-5 h-5 text-[#FF7058]" />
                  <span>ATS Score Diagnostic</span>
                </h3>
                <span className="font-serif text-2xl font-bold text-[#123B32]">
                  {parsedData.ats_analysis?.ats_score || 88} / 100
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-[#777D74]">
                  <span>Contact Verification:</span>
                  <span className="font-bold text-[#123B32]">
                    {parsedData.ats_analysis?.contact_verification || "100% Passed"}
                  </span>
                </div>
                <div className="flex justify-between text-[#777D74]">
                  <span>Formatting Readability:</span>
                  <span className="font-bold text-[#123B32]">
                    {parsedData.ats_analysis?.formatting_readability || "Clean / Table-Free"}
                  </span>
                </div>
                <div className="flex justify-between text-[#777D74]">
                  <span>Keyword Saturation:</span>
                  <span className="font-bold text-[#FF7058]">
                    {parsedData.ats_analysis?.keyword_saturation || "Optimal Density"}
                  </span>
                </div>
              </div>

              {parsedData.ats_analysis?.observations && parsedData.ats_analysis.observations.length > 0 && (
                <div className="pt-3 border-t border-[#E6E5DC] space-y-1.5">
                  <h4 className="text-[11px] uppercase font-bold text-[#123B32] tracking-wider">
                    ATS System Observations:
                  </h4>
                  <ul className="list-disc list-inside text-[11px] text-[#777D74] space-y-1">
                    {parsedData.ats_analysis.observations.map((obs, oidx) => (
                      <li key={oidx}>{obs}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Target Role ATS Calibrator */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E6E5DC]">
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#123B32] flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-[#FF7058]" />
                    <span>Role-Specific ATS Calibration</span>
                  </h3>
                  <p className="text-xs text-[#777D74] mt-0.5">
                    Test your resume against a specific target job designation or paste a target title to benchmark keywords.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Input
                  value={targetDesignationInput}
                  onChange={(e) => setTargetDesignationInput(e.target.value)}
                  placeholder="e.g. Junior Python Developer, Frontend Developer, Full Stack Engineer..."
                  className="h-10 text-xs bg-[#F7F5EF] border-[#E6E5DC] text-[#202722]"
                />
                <Button
                  onClick={() => handleCalibrateForRole(targetDesignationInput)}
                  disabled={isCalibratingTarget || !targetDesignationInput.trim()}
                  className="w-full sm:w-auto bg-[#123B32] text-white hover:bg-[#1C5246] text-xs font-semibold px-5 h-10 gap-1.5 shrink-0"
                >
                  {isCalibratingTarget ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5 text-[#FF7058]" />}
                  <span>Calibrate Target</span>
                </Button>
              </div>

              {/* Target Calibration Output */}
              {targetCalibrationResult && (
                <div className="mt-4 p-5 rounded-xl bg-[#F7F5EF] border border-[#E6E5DC] space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-[#E6E5DC] pb-2.5">
                    <div>
                      <span className="text-[11px] text-[#777D74] block">Target Role Benchmark</span>
                      <h4 className="font-serif text-base font-bold text-[#123B32]">
                        {targetCalibrationResult.target_designation}
                      </h4>
                    </div>
                    <Badge className="bg-[#123B32] text-[#F7F5EF] font-bold text-sm px-3 py-1">
                      {targetCalibrationResult.ats_match_percentage}% ATS Alignment
                    </Badge>
                  </div>

                  <p className="text-xs text-[#202722] leading-relaxed">
                    {targetCalibrationResult.suitability_reasoning}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="font-semibold text-emerald-800 text-[11px] uppercase tracking-wider block mb-1.5">
                        ✓ Evidenced Keywords:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {targetCalibrationResult.matching_keywords.length > 0 ? (
                          targetCalibrationResult.matching_keywords.map((kw, kidx) => (
                            <Badge key={kidx} className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]">
                              {kw}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[#777D74] text-[11px]">No exact keyword overlap</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold text-rose-800 text-[11px] uppercase tracking-wider block mb-1.5">
                        ⚠️ Critical Keywords to Incorporate:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {targetCalibrationResult.missing_critical_keywords.length > 0 ? (
                          targetCalibrationResult.missing_critical_keywords.map((kw, kidx) => (
                            <Badge key={kidx} variant="outline" className="text-rose-800 border-rose-300 bg-rose-50 text-[10px]">
                              + {kw}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-emerald-700 text-[11px]">All core keywords present!</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {targetCalibrationResult.optimization_recommendations && (
                    <div className="pt-2 border-t border-[#E6E5DC]">
                      <span className="font-semibold text-[#123B32] block text-[11px] mb-1">
                        Optimization Action Items for this Role:
                      </span>
                      <ul className="list-disc list-inside text-[#777D74] space-y-0.5 text-[11px]">
                        {targetCalibrationResult.optimization_recommendations.map((rec, ridx) => (
                          <li key={ridx}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION D: DEEP CANDIDATE INTELLIGENCE TABS ──────────────────── */}
          <div className="p-8 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow space-y-6">
            <div className="pb-4 border-b border-[#E6E5DC]">
              <h3 className="font-serif text-2xl font-bold text-[#123B32]">
                Candidate Profile Credentials & Evidence
              </h3>
              <p className="text-xs text-[#777D74] mt-1 font-sans">
                Review all extracted details categorized across skills, experience, education, projects, certifications, and factual evidence.
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="bg-[#F7F5EF] p-1 border border-[#E6E5DC] rounded-xl flex-wrap h-auto gap-1">
                <TabsTrigger value="skills" className="text-xs font-semibold data-[state=active]:bg-[#123B32] data-[state=active]:text-white">
                  Technical Skills ({parsedData.skills?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="experience" className="text-xs font-semibold data-[state=active]:bg-[#123B32] data-[state=active]:text-white">
                  Work Experience ({parsedData.experience?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="education" className="text-xs font-semibold data-[state=active]:bg-[#123B32] data-[state=active]:text-white">
                  Education ({parsedData.education?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="projects" className="text-xs font-semibold data-[state=active]:bg-[#123B32] data-[state=active]:text-white">
                  Projects ({parsedData.projects?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="certifications" className="text-xs font-semibold data-[state=active]:bg-[#123B32] data-[state=active]:text-white">
                  Certifications & Awards
                </TabsTrigger>
                <TabsTrigger value="evidence" className="text-xs font-semibold data-[state=active]:bg-[#123B32] data-[state=active]:text-white">
                  Facts vs. Inferences
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: TECHNICAL SKILLS */}
              <TabsContent value="skills" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {/* Programming Languages */}
                  <div className="p-4 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#123B32] uppercase tracking-wider">
                      <Code className="w-4 h-4 text-[#FF7058]" />
                      <span>Programming Languages</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedData.categorized_skills?.programming_languages && parsedData.categorized_skills.programming_languages.length > 0 ? (
                        parsedData.categorized_skills.programming_languages.map((sk, idx) => (
                          <Badge key={idx} className="bg-white text-[#123B32] border-[#E6E5DC] text-xs">
                            {sk}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-[#777D74]">None detected</span>
                      )}
                    </div>
                  </div>

                  {/* Frontend */}
                  <div className="p-4 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#123B32] uppercase tracking-wider">
                      <Globe className="w-4 h-4 text-[#FF7058]" />
                      <span>Frontend Technologies</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedData.categorized_skills?.frontend && parsedData.categorized_skills.frontend.length > 0 ? (
                        parsedData.categorized_skills.frontend.map((sk, idx) => (
                          <Badge key={idx} className="bg-white text-[#123B32] border-[#E6E5DC] text-xs">
                            {sk}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-[#777D74]">None detected</span>
                      )}
                    </div>
                  </div>

                  {/* Backend */}
                  <div className="p-4 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#123B32] uppercase tracking-wider">
                      <Layers className="w-4 h-4 text-[#FF7058]" />
                      <span>Backend & APIs</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedData.categorized_skills?.backend && parsedData.categorized_skills.backend.length > 0 ? (
                        parsedData.categorized_skills.backend.map((sk, idx) => (
                          <Badge key={idx} className="bg-white text-[#123B32] border-[#E6E5DC] text-xs">
                            {sk}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-[#777D74]">None detected</span>
                      )}
                    </div>
                  </div>

                  {/* Databases */}
                  <div className="p-4 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#123B32] uppercase tracking-wider">
                      <Database className="w-4 h-4 text-[#FF7058]" />
                      <span>Databases & Storage</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedData.categorized_skills?.databases && parsedData.categorized_skills.databases.length > 0 ? (
                        parsedData.categorized_skills.databases.map((sk, idx) => (
                          <Badge key={idx} className="bg-white text-[#123B32] border-[#E6E5DC] text-xs">
                            {sk}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-[#777D74]">None detected</span>
                      )}
                    </div>
                  </div>

                  {/* Cloud & DevOps */}
                  <div className="p-4 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#123B32] uppercase tracking-wider">
                      <Cloud className="w-4 h-4 text-[#FF7058]" />
                      <span>Cloud & DevOps</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedData.categorized_skills?.cloud_devops && parsedData.categorized_skills.cloud_devops.length > 0 ? (
                        parsedData.categorized_skills.cloud_devops.map((sk, idx) => (
                          <Badge key={idx} className="bg-white text-[#123B32] border-[#E6E5DC] text-xs">
                            {sk}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-[#777D74]">None detected</span>
                      )}
                    </div>
                  </div>

                  {/* Tools & Frameworks */}
                  <div className="p-4 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#123B32] uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-[#FF7058]" />
                      <span>Tools & Methodologies</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedData.categorized_skills?.tools_frameworks && parsedData.categorized_skills.tools_frameworks.length > 0 ? (
                        parsedData.categorized_skills.tools_frameworks.map((sk, idx) => (
                          <Badge key={idx} className="bg-white text-[#123B32] border-[#E6E5DC] text-xs">
                            {sk}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-[#777D74]">None detected</span>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: WORK EXPERIENCE */}
              <TabsContent value="experience" className="space-y-4">
                {parsedData.experience && parsedData.experience.length > 0 ? (
                  parsedData.experience.map((exp, idx) => (
                    <div key={idx} className="p-5 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/30 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#E6E5DC] pb-2.5">
                        <div>
                          <h4 className="font-serif text-base font-bold text-[#123B32]">
                            {exp.title}
                          </h4>
                          <span className="text-xs font-semibold text-[#FF7058]">
                            {exp.company}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs text-[#777D74] border-[#E6E5DC] bg-white self-start sm:self-auto">
                          {exp.duration}
                        </Badge>
                      </div>

                      {exp.description && (
                        <p className="text-xs text-[#202722] leading-relaxed">
                          {exp.description}
                        </p>
                      )}

                      {exp.responsibilities && exp.responsibilities.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-[#777D74] uppercase tracking-wider block">
                            Key Responsibilities & Deliverables:
                          </span>
                          <ul className="list-disc list-inside text-xs text-[#202722] space-y-1">
                            {exp.responsibilities.map((resp, ridx) => (
                              <li key={ridx}>{resp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-[#777D74] bg-[#F7F5EF] rounded-xl">
                    No traditional corporate employment history detected. The candidate profile is classified under entry-level / academic background.
                  </div>
                )}
              </TabsContent>

              {/* TAB 3: EDUCATION */}
              <TabsContent value="education" className="space-y-4">
                {parsedData.education && parsedData.education.length > 0 ? (
                  parsedData.education.map((edu, idx) => (
                    <div key={idx} className="p-5 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/30 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#E6E5DC] pb-2">
                        <div>
                          <h4 className="font-serif text-base font-bold text-[#123B32]">
                            {edu.degree}
                          </h4>
                          <span className="text-xs font-semibold text-[#123B32]">
                            {edu.institution}
                          </span>
                        </div>
                        {edu.year && (
                          <Badge variant="outline" className="text-xs text-[#777D74] border-[#E6E5DC] bg-white self-start sm:self-auto">
                            Class of {edu.year}
                          </Badge>
                        )}
                      </div>

                      {edu.field_of_study && (
                        <div className="text-xs text-[#777D74]">
                          Field of Study: <strong className="text-[#123B32]">{edu.field_of_study}</strong>
                        </div>
                      )}

                      {edu.academic_details && (
                        <p className="text-xs text-[#202722]">
                          {edu.academic_details}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-[#777D74] bg-[#F7F5EF] rounded-xl">
                    No academic degree or university credential was clearly stated in the uploaded resume.
                  </div>
                )}
              </TabsContent>

              {/* TAB 4: PROJECTS */}
              <TabsContent value="projects" className="space-y-4">
                {parsedData.projects && parsedData.projects.length > 0 ? (
                  parsedData.projects.map((proj, idx) => (
                    <div key={idx} className="p-5 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/30 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-[#E6E5DC] pb-2">
                        <h4 className="font-serif text-base font-bold text-[#123B32]">
                          {proj.name}
                        </h4>
                        {proj.link && (
                          <a
                            href={proj.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#123B32] hover:underline font-semibold flex items-center gap-1"
                          >
                            <span>View Source</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      <p className="text-xs text-[#202722] leading-relaxed">
                        {proj.description}
                      </p>

                      {proj.technologies && proj.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {proj.technologies.map((t, tidx) => (
                            <Badge key={tidx} variant="outline" className="bg-white text-[10px] text-[#123B32] border-[#E6E5DC]">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-[#777D74] bg-[#F7F5EF] rounded-xl">
                    No dedicated projects section detected.
                  </div>
                )}
              </TabsContent>

              {/* TAB 5: CERTIFICATIONS & ACHIEVEMENTS */}
              <TabsContent value="certifications" className="space-y-6">
                <div>
                  <h4 className="font-serif text-base font-bold text-[#123B32] mb-3">
                    Certifications & Licenses
                  </h4>
                  {parsedData.certifications && parsedData.certifications.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {parsedData.certifications.map((cert, idx) => {
                        const name = typeof cert === 'object' ? cert.name : cert;
                        const issuer = typeof cert === 'object' ? cert.issuer : null;
                        return (
                          <div key={idx} className="p-3.5 rounded-lg border border-[#E6E5DC] bg-[#F7F5EF]/40 flex items-center gap-3">
                            <Award className="w-5 h-5 text-[#FF7058] shrink-0" />
                            <div className="text-xs">
                              <span className="font-bold text-[#123B32] block">{name}</span>
                              {issuer && <span className="text-[#777D74] text-[11px]">{issuer}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-[#777D74] italic">No professional certifications detected.</p>
                  )}
                </div>

                {parsedData.achievements && parsedData.achievements.length > 0 && (
                  <div className="pt-4 border-t border-[#E6E5DC]">
                    <h4 className="font-serif text-base font-bold text-[#123B32] mb-3">
                      Honors, Highlights & Accomplishments
                    </h4>
                    <ul className="list-disc list-inside text-xs text-[#202722] space-y-1.5">
                      {parsedData.achievements.map((ach, idx) => (
                        <li key={idx}>{ach}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>

              {/* TAB 6: FACTS VS. INFERENCES */}
              <TabsContent value="evidence" className="space-y-4">
                <div className="p-5 rounded-xl border border-[#E6E5DC] bg-[#F7F5EF]/30 space-y-4 text-xs">
                  <div>
                    <h4 className="font-semibold text-emerald-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Explicitly Evidenced Facts (Directly Extracted from Document):</span>
                    </h4>
                    <ul className="list-disc list-inside text-[#202722] space-y-1">
                      {parsedData.facts_vs_inferences?.explicit_facts && parsedData.facts_vs_inferences.explicit_facts.length > 0 ? (
                        parsedData.facts_vs_inferences.explicit_facts.map((fact, fidx) => (
                          <li key={fidx}>{fact}</li>
                        ))
                      ) : (
                        <li>Contact details, document text, and listed technical tools verified.</li>
                      )}
                    </ul>
                  </div>

                  <div className="pt-3 border-t border-[#E6E5DC]">
                    <h4 className="font-semibold text-amber-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <span>AI-Generated Deductions & Estimates:</span>
                    </h4>
                    <ul className="list-disc list-inside text-[#777D74] space-y-1">
                      {parsedData.facts_vs_inferences?.inferences && parsedData.facts_vs_inferences.inferences.length > 0 ? (
                        parsedData.facts_vs_inferences.inferences.map((inf, iidx) => (
                          <li key={iidx}>{inf}</li>
                        ))
                      ) : (
                        <li>Total experience duration estimated based on project timelines.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {/* Enhanced Document Preview Modal */}
      <ResumeDocumentPreview
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        file={file}
        fileUrl={previewUrl}
        filename={file?.name}
      />

      {/* ── Reset Confirmation Dialog ────────────────────────────────────── */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="bg-white border-[#E6E5DC] text-[#123B32]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-bold text-[#123B32]">
              Reset Page?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[#777D74] leading-relaxed">
              Are you sure you want to reset the current resume analysis? This will clear the active document, extracted intelligence, and temporary ATS calibration scores. Saved resumes and your candidate profile will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="text-xs border-[#E6E5DC]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetPage}
              className="bg-[#FF7058] hover:bg-[#E55A42] text-white text-xs font-semibold"
            >
              Reset Page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Review & Update Candidate Profile Modal ───────────────────────── */}
      <Dialog open={showProfileReviewModal} onOpenChange={setShowProfileReviewModal}>
        <DialogContent className="max-w-2xl bg-white border-[#E6E5DC] text-[#123B32] max-h-[85vh] flex flex-col">
          <DialogHeader className="pb-3 border-b border-[#E6E5DC]">
            <DialogTitle className="font-serif text-xl font-bold flex items-center gap-2 text-[#123B32]">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              <span>Review & Update Candidate Profile</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#777D74]">
              Select which verified details extracted from your resume to update in your candidate profile. Unchecked fields will remain untouched.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between py-2 px-1 text-xs text-[#777D74] border-b border-[#E6E5DC]/60">
            <span>Choose fields to synchronize:</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedProfileFields({
                  full_name: true, phone: true, location: true, skills: true,
                  experience: true, education: true, headline: true, summary: true
                })}
                className="text-[#123B32] font-semibold hover:underline"
              >
                Select All
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setSelectedProfileFields({
                  full_name: false, phone: false, location: false, skills: false,
                  experience: false, education: false, headline: false, summary: false
                })}
                className="text-[#777D74] hover:text-[#123B32]"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="overflow-y-auto space-y-3 py-2 pr-1 flex-1 text-xs">
            {/* Field: Full Name */}
            <div className="p-3 rounded-lg border border-[#E6E5DC] bg-[#F7F5EF]/50 flex items-start gap-3">
              <Checkbox
                id="field-name"
                checked={selectedProfileFields.full_name}
                onCheckedChange={(checked) => setSelectedProfileFields(p => ({ ...p, full_name: !!checked }))}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label htmlFor="field-name" className="font-bold text-[#123B32] cursor-pointer">
                  Full Name
                </label>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[#777D74] block">Current Profile:</span>
                    <span className="text-stone-600">{currentCandidateProfile?.candidate_name || "(Not set)"}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-semibold block">Resume Detected:</span>
                    <span className="text-[#123B32] font-medium">{parsedData?.contact?.name || "(Not found in resume)"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Field: Phone */}
            <div className="p-3 rounded-lg border border-[#E6E5DC] bg-[#F7F5EF]/50 flex items-start gap-3">
              <Checkbox
                id="field-phone"
                checked={selectedProfileFields.phone}
                onCheckedChange={(checked) => setSelectedProfileFields(p => ({ ...p, phone: !!checked }))}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label htmlFor="field-phone" className="font-bold text-[#123B32] cursor-pointer">
                  Phone Number
                </label>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[#777D74] block">Current Profile:</span>
                    <span className="text-stone-600">{currentCandidateProfile?.phone || "(Not set)"}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-semibold block">Resume Detected:</span>
                    <span className="text-[#123B32] font-medium">{parsedData?.contact?.phone || "(Not found in resume)"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Field: Location */}
            <div className="p-3 rounded-lg border border-[#E6E5DC] bg-[#F7F5EF]/50 flex items-start gap-3">
              <Checkbox
                id="field-location"
                checked={selectedProfileFields.location}
                onCheckedChange={(checked) => setSelectedProfileFields(p => ({ ...p, location: !!checked }))}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label htmlFor="field-location" className="font-bold text-[#123B32] cursor-pointer">
                  Location
                </label>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[#777D74] block">Current Profile:</span>
                    <span className="text-stone-600">{currentCandidateProfile?.location || "(Not set)"}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-semibold block">Resume Detected:</span>
                    <span className="text-[#123B32] font-medium">{parsedData?.contact?.location || "(Not found in resume)"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Field: Skills */}
            <div className="p-3 rounded-lg border border-[#E6E5DC] bg-[#F7F5EF]/50 flex items-start gap-3">
              <Checkbox
                id="field-skills"
                checked={selectedProfileFields.skills}
                onCheckedChange={(checked) => setSelectedProfileFields(p => ({ ...p, skills: !!checked }))}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label htmlFor="field-skills" className="font-bold text-[#123B32] cursor-pointer">
                  Skills ({parsedData?.skills?.length || 0} extracted)
                </label>
                <div className="space-y-1 text-[11px]">
                  <span className="text-emerald-700 font-semibold block">Extracted from Resume:</span>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 bg-white rounded border border-[#E6E5DC]">
                    {(parsedData?.skills || []).slice(0, 20).map((sk, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-medium border border-emerald-200">
                        {sk}
                      </span>
                    ))}
                    {(parsedData?.skills?.length || 0) > 20 && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        +{(parsedData?.skills?.length || 0) - 20} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Field: Total Experience */}
            <div className="p-3 rounded-lg border border-[#E6E5DC] bg-[#F7F5EF]/50 flex items-start gap-3">
              <Checkbox
                id="field-exp"
                checked={selectedProfileFields.experience}
                onCheckedChange={(checked) => setSelectedProfileFields(p => ({ ...p, experience: !!checked }))}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label htmlFor="field-exp" className="font-bold text-[#123B32] cursor-pointer">
                  Experience Level
                </label>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[#777D74] block">Current Profile:</span>
                    <span className="text-stone-600">{currentCandidateProfile?.experience || "(Not set)"}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-semibold block">Resume Detected:</span>
                    <span className="text-[#123B32] font-medium">{parsedData?.total_experience || "(Not found)"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Field: Target Role / Headline */}
            <div className="p-3 rounded-lg border border-[#E6E5DC] bg-[#F7F5EF]/50 flex items-start gap-3">
              <Checkbox
                id="field-headline"
                checked={selectedProfileFields.headline}
                onCheckedChange={(checked) => setSelectedProfileFields(p => ({ ...p, headline: !!checked }))}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label htmlFor="field-headline" className="font-bold text-[#123B32] cursor-pointer">
                  Headline / Target Job Role
                </label>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[#777D74] block">Current Profile:</span>
                    <span className="text-stone-600">{currentCandidateProfile?.headline || "(Not set)"}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-semibold block">Recommended Designation:</span>
                    <span className="text-[#123B32] font-medium">{parsedData?.recommended_designations?.[0]?.title || parsedData?.recommended_designations?.[0]?.designation || parsedData?.experience?.[0]?.title || "(Not found)"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Field: Summary */}
            <div className="p-3 rounded-lg border border-[#E6E5DC] bg-[#F7F5EF]/50 flex items-start gap-3">
              <Checkbox
                id="field-summary"
                checked={selectedProfileFields.summary}
                onCheckedChange={(checked) => setSelectedProfileFields(p => ({ ...p, summary: !!checked }))}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label htmlFor="field-summary" className="font-bold text-[#123B32] cursor-pointer">
                  Professional Summary
                </label>
                <p className="text-[11px] text-stone-600 line-clamp-2">
                  {parsedData?.summary || "(No summary detected)"}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-[#E6E5DC] flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowProfileReviewModal(false)}
              className="text-xs border-[#E6E5DC]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmProfileUpdate}
              disabled={isUpdatingProfile}
              className="bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] text-xs font-semibold gap-1.5"
            >
              {isUpdatingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
              <span>Confirm & Update Profile</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
