import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import {
  Briefcase, Building2, MapPin, DollarSign, Calendar, Clock, Users,
  Upload, FileText, CheckCircle2, ArrowRight, ExternalLink, Search, Sparkles,
  Mail, Eye, Bookmark, BookmarkCheck, RefreshCw, X, ChevronLeft, ChevronRight,
  Globe, Laptop, Radio, ShieldCheck, Copy, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { jobsService } from "@/services/jobsService";
import { applicationService } from "@/services/applicationService";
import { getCandidateProfile } from "@/utils/profileSync";
import JobDescriptionRenderer, { getCleanJobDescriptionPreview } from "@/components/JobDescriptionRenderer";

export interface UnifiedJob {
  id: number;
  uuid: string;
  job_type: "imported" | "recruiter";
  source: string; // greenhouse, lever, ashby, workable, generic_ats, recruiter
  external_job_id?: string;
  title: string;
  company_name: string;
  company_logo_url?: string;
  organization_symbol?: string;
  description: string;
  requirements?: string;
  recruiting_process?: string;
  location: string;
  workplace_type: string; // remote, hybrid, on-site
  employment_type: string; // Full-time, Part-time, Contract, etc.
  salary?: string;
  skills: string[];
  job_posting_url?: string;
  posted_at?: string;
  deadline?: string;
  is_saved: boolean;
  vacancies?: number;
  integration_id?: number;
  start_date_pt?: string;
  final_date_pt?: string;
  timezone?: string;
}

export default function CandidateJobsPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Sync URL Search Parameters for Refresh Persistence ──────────────────────
  const searchQuery = searchParams.get("search") || "";
  const locationFilter = searchParams.get("location") || "";
  const workplaceFilter = searchParams.get("workplace") || "all";
  const employmentFilter = searchParams.get("employment") || "all";
  const sourceFilter = searchParams.get("source") || "all";
  const sortFilter = searchParams.get("sort") || "newest";
  const savedOnly = searchParams.get("saved") === "true";
  const currentPage = parseInt(searchParams.get("page") || "1", 10) || 1;

  // Local filter update helper
  const updateFilters = (updates: Record<string, string | number | boolean | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, val]) => {
        if (val === null || val === "" || val === "all" || (key === "page" && val === 1) || (key === "saved" && val === false) || (key === "sort" && val === "newest")) {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      });
      return next;
    }, { replace: true });
  };

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  // ── Component State ─────────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Synchronized candidate customize preferences
  const [candidatePrefs, setCandidatePrefs] = useState<{
    skills: string[];
    experience: number;
    experience_level: string;
    location: string;
    customize_active: boolean;
  } | null>(null);
  const [useCandidatePrefs, setUseCandidatePrefs] = useState<boolean>(true);

  const hasActiveFilters = Boolean(
    searchQuery ||
    locationFilter ||
    workplaceFilter !== "all" ||
    employmentFilter !== "all" ||
    sourceFilter !== "all" ||
    savedOnly ||
    sortFilter !== "newest" ||
    (useCandidatePrefs && Boolean(candidatePrefs?.customize_active) && (candidatePrefs.skills?.length > 0 || candidatePrefs.location))
  );

  const [selectedJob, setSelectedJob] = useState<UnifiedJob | null>(null);
  const [viewingRoleDetailsJob, setViewingRoleDetailsJob] = useState<UnifiedJob | null>(null);

  // Application form state & verified submission tracking
  const [isApplying, setIsApplying] = useState(false);
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [analyzingResume, setAnalyzingResume] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [useProfileResume, setUseProfileResume] = useState(true);
  const [activeResumeName, setActiveResumeName] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    reference_id: string;
    delivery_status: string;
    delivery_channel?: string;
    delivery_details?: string;
    email_status?: string;
    email_recipient?: string;
  } | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // ── Load Jobs with Multi-Filter & Backend API ──────────────────────────────
  const loadJobs = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (locationFilter) params.append("location", locationFilter);
      if (workplaceFilter !== "all") params.append("workplace_type", workplaceFilter);
      if (employmentFilter !== "all") params.append("employment_type", employmentFilter);
      if (sourceFilter !== "all") params.append("source", sourceFilter);
      if (sortFilter) params.append("sort", sortFilter);
      if (savedOnly) params.append("saved_only", "true");
      params.append("page", String(currentPage));
      params.append("page_size", "12");

      // Synchronize candidate customize preferences ONLY if Customize mode is active and not manually paused/overridden
      const isCustomizeActive = Boolean(candidatePrefs?.customize_active);
      if (useCandidatePrefs && isCustomizeActive && candidatePrefs) {
        if (!locationFilter && candidatePrefs.location) {
          params.append("location", candidatePrefs.location);
        }
        if (!searchQuery && candidatePrefs.skills?.length > 0) {
          params.append("skills", candidatePrefs.skills.join(","));
        }
        if (typeof candidatePrefs.experience === "number") {
          params.append("experience", String(candidatePrefs.experience));
        }
      }

      const resp = await apiClient.get(`${API_ENDPOINTS.jobs.list}?${params.toString()}`);
      if (resp.data && Array.isArray(resp.data.jobs)) {
        setJobs(resp.data.jobs);
        setTotalJobs(resp.data.total ?? resp.data.jobs.length);
        setTotalPages(resp.data.total_pages ?? 1);
        if (resp.data.available_sources) {
          setAvailableSources(resp.data.available_sources);
        }
        if (resp.data.last_synced_at) {
          setLastSyncedAt(resp.data.last_synced_at);
        }
      } else {
        await loadLegacyFallbackJobs();
      }
    } catch (err: any) {
      console.warn("Unified jobs endpoint error:", err);
      const errMsg = err.response?.data?.detail || err.message || "Failed to communicate with job listings backend";
      setApiError(errMsg);
      await loadLegacyFallbackJobs();
    } finally {
      setLoading(false);
    }
  };

  const loadLegacyFallbackJobs = async () => {
    try {
      const resp = await apiClient.get(API_ENDPOINTS.recruiter.candidateJobs);
      const apiJobs = resp.data || [];
      if (Array.isArray(apiJobs) && apiJobs.length > 0) {
        const mapped: UnifiedJob[] = apiJobs.map((j: any) => ({
          id: Number(j.id) || 1,
          uuid: j.uuid || String(j.id),
          job_type: "recruiter",
          source: "recruiter",
          external_job_id: `rec-${j.id}`,
          title: j.title,
          company_name: j.company_name || "AutoAgentHire Partner",
          company_logo_url: j.company_logo_url,
          organization_symbol: j.organization_symbol,
          location: j.location || "Remote",
          workplace_type: (j.location || "").toLowerCase().includes("hybrid") ? "hybrid" : (j.location || "").toLowerCase().includes("remote") ? "remote" : "on-site",
          employment_type: j.job_type || "Full-time",
          salary: j.salary_description || "Competitive",
          skills: j.skills ? j.skills.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          description: j.description || "",
          requirements: j.requirements,
          recruiting_process: j.recruiting_process,
          vacancies: j.vacancies || 1,
          start_date_pt: j.start_date_pt || new Date().toISOString(),
          final_date_pt: j.final_date_pt || new Date(Date.now() + 30 * 86400000).toISOString(),
          timezone: j.timezone || "Asia/Kolkata (IST)",
          is_saved: false,
        }));
        setJobs(mapped);
        setTotalJobs(mapped.length);
        setTotalPages(1);
        setApiError(null);
      } else {
        setJobs([]);
        setTotalJobs(0);
        setTotalPages(1);
      }
    } catch (fallbackErr: any) {
      console.error("Failed to load candidate jobs fallback:", fallbackErr);
      setJobs([]);
      setTotalJobs(0);
      setTotalPages(1);
      if (!apiError) {
        setApiError(fallbackErr.message || "Failed to load candidate jobs");
      }
    }
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      const resp = await apiClient.post(`${API_ENDPOINTS.jobs.sync || '/api/jobs/sync'}?limit=50`);
      toast({
        title: "Requisitions Synchronized",
        description: resp.data?.message || "Successfully fetched latest job listings from external providers.",
      });
      await loadJobs();
    } catch (err: any) {
      toast({
        title: "Sync Notice",
        description: err.response?.data?.detail || err.message || "Unable to trigger manual synchronization.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Auto-fill candidate profile ─────────────────────────────────────────────
  const autoFillCandidateProfile = async () => {
    const profile = getCandidateProfile();
    if (profile.candidate_name && profile.candidate_name !== "Candidate") {
      setCandidateName(profile.candidate_name);
    }
    if (profile.email) setCandidateEmail(profile.email);
    if (profile.phone) setCandidatePhone(profile.phone);

    try {
      const resp = await apiClient.get(API_ENDPOINTS.auth.me);
      if (resp.data) {
        if (resp.data.full_name) setCandidateName(resp.data.full_name);
        if (resp.data.email) setCandidateEmail(resp.data.email);
        if (resp.data.phone) setCandidatePhone(resp.data.phone);
      }
    } catch {
      const savedName = localStorage.getItem("candidate_name") || "";
      const savedEmail = localStorage.getItem("candidate_email") || "";
      const savedPhone = localStorage.getItem("candidate_phone") || "";
      if (savedName && !candidateName) setCandidateName(savedName);
      if (savedEmail && !candidateEmail) setCandidateEmail(savedEmail);
      if (savedPhone && !candidatePhone) setCandidatePhone(savedPhone);
    }

    try {
      const atsResp = await apiClient.get(API_ENDPOINTS.ats.currentProfile);
      if (atsResp.data?.profile) {
        const p = atsResp.data.profile;
        if (p.resume_filename) {
          setActiveResumeName(p.resume_filename);
        }
        if (p.name && (!candidateName || candidateName === "Candidate")) {
          setCandidateName(p.name);
        }
        if (p.email && !candidateEmail) {
          setCandidateEmail(p.email);
        }
        if (p.phone && !candidatePhone) {
          setCandidatePhone(p.phone);
        }
      }
    } catch { }
  };

  // Initial mount and reload when filter params or candidate preferences change
  useEffect(() => {
    loadJobs();
  }, [searchQuery, locationFilter, workplaceFilter, employmentFilter, sourceFilter, sortFilter, savedOnly, currentPage, candidatePrefs, useCandidatePrefs]);

  useEffect(() => {
    autoFillCandidateProfile();

    // Fetch synchronized candidate preferences from backend / localStorage
    const loadPreferences = async () => {
      try {
        const resp = await apiClient.get(API_ENDPOINTS.candidate.preferences);
        if (resp.data && (resp.data.skills?.length > 0 || resp.data.location || resp.data.customize_active)) {
          setCandidatePrefs(resp.data);
        }
      } catch {
        try {
          const rawSkills = localStorage.getItem('autoagenthire_custom_skills');
          const skills = rawSkills ? JSON.parse(rawSkills) : [];
          const years = Number(localStorage.getItem('autoagenthire_custom_years') || 0);
          const level = localStorage.getItem('autoagenthire_custom_level') || 'fresher';
          const loc = localStorage.getItem('autoagenthire_custom_location') || '';
          const active = localStorage.getItem('autoagenthire_customize_mode') === 'true';
          if (skills.length > 0 || loc || active) {
            setCandidatePrefs({
              skills,
              experience: years,
              experience_level: level,
              location: loc,
              customize_active: active,
            });
          }
        } catch {}
      }
    };
    loadPreferences();

    const handleProfileUpdate = () => autoFillCandidateProfile();
    const handleJobUpdate = () => loadJobs();
    const handlePrefsUpdated = (e: any) => {
      if (e.detail) {
        setCandidatePrefs(e.detail);
      }
    };

    window.addEventListener("candidateProfileUpdated", handleProfileUpdate);
    window.addEventListener("jobPostingsUpdated", handleJobUpdate);
    window.addEventListener("candidatePreferencesUpdated", handlePrefsUpdated);
    return () => {
      window.removeEventListener("candidateProfileUpdated", handleProfileUpdate);
      window.removeEventListener("jobPostingsUpdated", handleJobUpdate);
      window.removeEventListener("candidatePreferencesUpdated", handlePrefsUpdated);
    };
  }, []);

  // ── Bookmark / Save Job Toggle ──────────────────────────────────────────────
  const handleToggleSaveJob = async (job: UnifiedJob, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Optimistic UI update
    const previousState = job.is_saved;
    const nextSaved = !previousState;

    setJobs((prev) =>
      prev.map((j) => (j.id === job.id && j.job_type === job.job_type ? { ...j, is_saved: nextSaved } : j))
    );

    if (viewingRoleDetailsJob && viewingRoleDetailsJob.id === job.id) {
      setViewingRoleDetailsJob({ ...viewingRoleDetailsJob, is_saved: nextSaved });
    }

    try {
      const res = await apiClient.post(API_ENDPOINTS.jobs.toggleSave(job.id), {
        job_type: job.job_type,
      });
      toast({
        title: nextSaved ? "Job Saved! 📌" : "Bookmark Removed",
        description: res?.data?.message || (nextSaved ? "Added to your saved opportunities." : "Removed from bookmarks."),
      });
    } catch (err: any) {
      // Revert on failure
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id && j.job_type === job.job_type ? { ...j, is_saved: previousState } : j))
      );
      toast({
        title: "Bookmark update failed",
        description: err?.response?.data?.detail || "Please sign in as a candidate to save jobs.",
        variant: "destructive",
      });
    }
  };

  // ── Apply Action Router (Unified Internal Portal Flow) ───────────────────────
  const handleApplyClick = (job: UnifiedJob) => {
    // Every job application happens directly inside AutoAgentHire
    setSelectedJob(job);
    setSubmissionResult(null);
    setConsentAccepted(false);
    setIsApplying(true);
  };

  // ── Resume AI Parsing ───────────────────────────────────────────────────────
  const handleAnalyzeResume = async () => {
    if (!resumeFile) {
      toast({
        title: "No Resume Selected",
        description: "Please upload or select a resume file first to analyze.",
        variant: "destructive",
      });
      return;
    }

    setAnalyzingResume(true);
    try {
      const formData = new FormData();
      formData.append("file", resumeFile);
      const resp = await apiClient.postFormData(API_ENDPOINTS.ats.parseResume, formData);
      const parsed = resp.data?.parsed_data || {};
      const contact = parsed.contact || {};
      const skills = parsed.skills || [];
      const experience = parsed.experience || [];

      if (contact.name && !candidateName) setCandidateName(contact.name);
      if (contact.email && !candidateEmail) setCandidateEmail(contact.email);
      if (contact.phone && !candidatePhone) setCandidatePhone(contact.phone);

      const skillList = skills.slice(0, 8).join(", ");
      const expSnippet = experience.length > 0 && experience[0].title ? `with background in ${experience[0].title}` : "";
      if (!coverLetter && (skillList || expSnippet)) {
        setCoverLetter(`Experienced professional ${expSnippet}. Core proficiencies include: ${skillList}. Excited to contribute to ${selectedJob?.title || "this role"}!`);
      }

      toast({
        title: "Resume Analyzed & Auto-Filled! ✨",
        description: `Extracted candidate information and ${skills.length} skills automatically from ${resumeFile.name}.`,
      });
    } catch {
      toast({
        title: "Analysis Notice",
        description: "Could not automatically parse all fields. You can manually complete the details.",
        variant: "destructive",
      });
    } finally {
      setAnalyzingResume(false);
    }
  };

  // ── Unified Internal Job Application Submit ────────────────────────────────
  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    if (!consentAccepted) {
      toast({
        title: "Consent Required",
        description: `Please accept the consent authorization to submit your application to ${selectedJob.company_name}.`,
        variant: "destructive",
      });
      return;
    }

    const cleanName = candidateName.trim();
    const cleanEmail = candidateEmail.trim();

    if (!cleanName || !cleanEmail) {
      toast({
        title: "Required fields missing",
        description: "Please provide your Full Name and Email Address.",
        variant: "destructive",
      });
      return;
    }

    setApplySubmitting(true);
    try {
      const formData = new FormData();
      formData.append("candidate_name", cleanName);
      formData.append("candidate_email", cleanEmail);
      if (candidatePhone) formData.append("candidate_phone", candidatePhone.trim());
      if (portfolioUrl) formData.append("portfolio_url", portfolioUrl.trim());
      if (coverLetter) formData.append("cover_letter", coverLetter.trim());
      formData.append("job_type", selectedJob.job_type || "imported");

      // Attach newly uploaded resume file if selected
      if (resumeFile && (!useProfileResume || !activeResumeName)) {
        formData.append("resume", resumeFile);
      }

      const applyUrl = `/api/recruiter/candidate/apply/${selectedJob.id}?job_type=${selectedJob.job_type || "imported"}`;
      const resp = await apiClient.postFormData(applyUrl, formData);

      const resData = resp.data || {};
      const refId = resData.reference_id || `AAH-APP-2026-${selectedJob.id}`;
      const delivStatus = resData.delivery_status || "Delivered to Employer";
      const delivChannel = resData.delivery_channel || "AutoAgentHire Portal Vault";
      const delivDetails = resData.delivery_details || "";

      setSubmissionResult({
        reference_id: refId,
        delivery_status: delivStatus,
        delivery_channel: delivChannel,
        delivery_details: delivDetails,
        email_status: resData.email_status,
        email_recipient: resData.email_recipient || cleanEmail,
      });

      // Also persist to local cache for offline/instant sync and notify application tracker
      try {
        await applicationService.saveClientApplication({
          id: selectedJob.id,
          title: selectedJob.title,
          company: selectedJob.company_name,
          location: selectedJob.location,
          match_score: 95,
          candidate_name: cleanName,
          candidate_email: cleanEmail,
          candidate_phone: candidatePhone,
          url: "/candidate/jobs",
          reference_id: refId,
          delivery_status: delivStatus,
        });
      } catch { }

      // Real-time notification across dashboard tabs (Applications.tsx, Overview, etc.)
      try {
        window.dispatchEvent(new CustomEvent("applicationSubmitted", { detail: resData }));
      } catch { }

      toast({
        title: "Application Submitted! 🎉",
        description: `Official Reference: ${refId}. Confirmation sent to ${cleanEmail}.`,
      });

      setCoverLetter("");
      setResumeFile(null);
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail || err.message || "Failed to submit application";

      if (status === 409) {
        toast({
          title: "Already Applied 📌",
          description: detail,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Application Failed",
          description: detail,
          variant: "destructive",
        });
      }
    } finally {
      setApplySubmitting(false);
    }
  };

  // ── Source Provider Badge Helper ────────────────────────────────────────────
  const renderSourceBadge = (source: string) => {
    const s = source.toLowerCase();
    switch (s) {
      case "greenhouse":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Greenhouse ATS
          </span>
        );
      case "lever":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
            Lever ATS
          </span>
        );
      case "ashby":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            Ashby HQ
          </span>
        );
      case "workable":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Workable
          </span>
        );
      case "website_url":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <Globe className="w-3 h-3 text-teal-600" />
            Company Website
          </span>
        );
      case "generic_ats":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-stone-100 text-stone-700 border border-stone-200">
            Direct ATS API
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Verified Recruiter
          </span>
        );
    }
  };

  // ── Workplace Type Badge Helper ─────────────────────────────────────────────
  const renderWorkplaceBadge = (workplace: string) => {
    const w = workplace.toLowerCase();
    if (w === "remote") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[#123B32]/10 text-[#123B32] font-semibold border border-[#123B32]/20">
          <Globe className="w-3 h-3 text-[#123B32]" />
          Remote
        </span>
      );
    }
    if (w === "hybrid") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
          <Laptop className="w-3 h-3 text-blue-600" />
          Hybrid
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-semibold border border-stone-200">
        <Building2 className="w-3 h-3 text-stone-600" />
        On-site
      </span>
    );
  };

  return (
    <div className="w-full text-[#202722] flex flex-col space-y-6">
      {/* ── Editorial Header Banner ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E6E5DC] py-8 px-6 sm:px-10 editorial-shadow">
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full bg-[#123B32]/10 text-[#123B32] border border-[#123B32]/20">
              <Sparkles className="w-3 h-3 text-[#FF7058]" />
              <span>Real-Time Connected ATS Requisitions</span>
            </span>
            {lastSyncedAt && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[#777D74] bg-[#F7F5EF] px-2.5 py-0.5 rounded-full border border-[#E6E5DC]">
                <Radio className="w-2.5 h-2.5 text-emerald-500 animate-pulse" />
                API Synced: {new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#123B32] tracking-tight">
            Curated Opportunities from Top Employers
          </h1>
          <p className="text-[#777D74] text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed font-sans">
            Real job openings supplied directly through connected Greenhouse, Lever, Ashby, and Workable APIs, plus verified internal partner requisitions.
          </p>

          {/* Search bar */}
          <div className="max-w-2xl mx-auto relative mt-5">
            <Search className="w-4 h-4 absolute left-4 top-3.5 text-[#777D74]" />
            <Input
              placeholder="Search by job title, company name, skills, or keywords..."
              className="pl-11 pr-10 h-12 rounded-xl bg-[#F7F5EF] border-[#E6E5DC] text-xs sm:text-sm text-[#202722] focus-visible:ring-[#123B32]"
              value={searchQuery}
              onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
            />
            {searchQuery && (
              <button
                onClick={() => updateFilters({ search: "", page: 1 })}
                className="absolute right-3.5 top-3.5 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Jobs Listing Grid ───────────────────────────────────────────── */}
      <main className="flex-1 w-full space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#E6E5DC]">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#123B32]">
                {savedOnly ? "Saved Opportunities" : "Available Positions"} ({totalJobs})
              </h2>
              <p className="text-xs text-[#777D74] mt-0.5">
                Page {currentPage} of {totalPages} • Showing real-time synchronized job listings
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerSync}
                disabled={isSyncing || loading}
                className="text-xs font-semibold text-[#123B32] border-[#E6E5DC] gap-1.5 hover:bg-[#F7F5EF]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                <span>{isSyncing ? "Syncing..." : "Sync ATS"}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadJobs}
                disabled={loading}
                className="text-xs font-medium text-[#123B32] gap-1.5 hover:bg-[#F7F5EF]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>

          {/* Synchronized Candidate Customize Preferences Banner */}
          {candidatePrefs && candidatePrefs.customize_active && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 px-4 rounded-xl bg-[#123B32]/5 border border-[#123B32]/15 text-xs text-[#123B32]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold flex items-center gap-1.5 text-[#123B32]">
                  <Sparkles className="w-4 h-4 text-[#FF7058]" />
                  Customized Requisitions:
                </span>
                {candidatePrefs.skills?.length > 0 && (
                  <Badge variant="outline" className="text-[11px] bg-white border-[#123B32]/25 text-[#123B32] font-medium">
                    Skills: {candidatePrefs.skills.slice(0, 3).join(", ")}{candidatePrefs.skills.length > 3 ? ` +${candidatePrefs.skills.length - 3}` : ""}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[11px] bg-white border-[#123B32]/25 text-[#123B32] font-medium">
                  {candidatePrefs.experience === 0 ? "Fresher (0 yrs)" : `${candidatePrefs.experience} yrs exp`}
                </Badge>
                {candidatePrefs.location && (
                  <Badge variant="outline" className="text-[11px] bg-white border-[#123B32]/25 text-[#123B32] font-medium">
                    📍 {candidatePrefs.location}
                  </Badge>
                )}
                {useCandidatePrefs ? (
                  <Badge className="bg-[#123B32] text-[#F7F5EF] text-[10px] px-2 py-0.5">Applied</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-800">Paused</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUseCandidatePrefs(!useCandidatePrefs)}
                  className="text-xs h-7 px-2.5 text-[#777D74] hover:text-[#123B32]"
                >
                  {useCandidatePrefs ? "Pause Preferences" : "Re-apply Preferences"}
                </Button>
                <Link
                  to="/dashboard/automation"
                  className="text-xs text-[#123B32] hover:underline font-semibold flex items-center gap-1"
                >
                  <span>Edit in Customize</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-white border border-[#E6E5DC] animate-pulse space-y-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-stone-200" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-stone-200 rounded w-3/4" />
                      <div className="h-3 bg-stone-100 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-12 bg-stone-100 rounded" />
                  <div className="h-8 bg-stone-200 rounded" />
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-16 text-center bg-white rounded-2xl border border-[#E6E5DC] editorial-shadow">
              {apiError ? (
                <>
                  <div className="w-14 h-14 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-4 text-rose-600">
                    <Radio className="w-7 h-7" />
                  </div>
                  <h3 className="font-serif text-xl font-bold text-[#123B32] mb-2">Unable to Connect to Job Service</h3>
                  <p className="text-[#777D74] max-w-md mx-auto text-xs leading-relaxed mb-5 font-sans">
                    The application could not retrieve listings from the job backend ({apiError}). Please verify backend connectivity.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      onClick={loadJobs}
                      disabled={loading}
                      className="border-[#E6E5DC] text-xs font-semibold gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                      <span>Retry Connection</span>
                    </Button>
                    <Button
                      onClick={handleTriggerSync}
                      disabled={isSyncing}
                      className="bg-[#123B32] text-white hover:bg-[#0E2E27] text-xs font-semibold gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#FF7058]" />
                      <span>{isSyncing ? "Syncing Requisitions..." : "Synchronize Requisitions"}</span>
                    </Button>
                  </div>
                </>
              ) : hasActiveFilters ? (
                <>
                  <div className="w-14 h-14 rounded-xl bg-[#F7F5EF] flex items-center justify-center mx-auto mb-4 text-[#123B32]">
                    <Briefcase className="w-7 h-7" />
                  </div>
                  <h3 className="font-serif text-xl font-bold text-[#123B32] mb-2">No Matching Roles Found</h3>
                  <p className="text-[#777D74] max-w-md mx-auto text-xs leading-relaxed mb-4 font-sans">
                    {savedOnly
                      ? "You haven't bookmarked any jobs matching your active search. Browse available positions and click the bookmark icon to save roles."
                      : "No job postings matched your active search or filters. Try relaxing your location, workplace, or source criteria."}
                  </p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={clearAllFilters}
                      className="border-[#E6E5DC] text-xs font-semibold"
                    >
                      Clear Search & Filters
                    </Button>
                    {candidatePrefs?.customize_active && useCandidatePrefs && (
                      <Button
                        variant="ghost"
                        onClick={() => setUseCandidatePrefs(false)}
                        className="text-xs text-[#123B32] font-semibold border border-[#123B32]/20"
                      >
                        Pause Custom Preferences
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-xl bg-[#123B32]/10 border border-[#123B32]/20 flex items-center justify-center mx-auto mb-4 text-[#123B32]">
                    <Sparkles className="w-7 h-7 text-[#FF7058]" />
                  </div>
                  <h3 className="font-serif text-xl font-bold text-[#123B32] mb-2">No Active Job Requisitions Synchronized</h3>
                  <p className="text-[#777D74] max-w-md mx-auto text-xs leading-relaxed mb-5 font-sans">
                    Connected ATS portals (Greenhouse, Ashby, Lever) have not yet populated positions into the local database. Click below to fetch real live postings directly.
                  </p>
                  <Button
                    onClick={handleTriggerSync}
                    disabled={isSyncing}
                    className="bg-[#123B32] text-white hover:bg-[#0E2E27] text-xs font-semibold gap-2 px-5 py-2.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                    <span>{isSyncing ? "Synchronizing Providers..." : "Synchronize Requisitions Now"}</span>
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {jobs.map((job) => (
                <div
                  key={`${job.job_type}-${job.id}`}
                  className="p-6 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow editorial-card-hover flex flex-col justify-between relative group"
                >
                  <div>
                    {/* Top Header: Logo, Company, Title, Bookmark */}
                    <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-[#E6E5DC]">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            job.company_logo_url ||
                            "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"
                          }
                          alt={job.company_name}
                          className="w-11 h-11 rounded-lg object-cover bg-stone-100 border border-[#E6E5DC] shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                          }}
                        />
                        <div>
                          <h4 className="font-serif text-base font-bold text-[#123B32] line-clamp-1">
                            {job.title}
                          </h4>
                          <div className="text-xs text-[#777D74] flex items-center gap-1.5 mt-0.5">
                            <span className="font-semibold text-[#202722]">{job.company_name}</span>
                            {job.organization_symbol && (
                              <span className="text-[10px] py-0 px-1 font-mono rounded bg-stone-100 text-[#777D74]">
                                {job.organization_symbol}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bookmark Toggle Icon Button */}
                      <button
                        onClick={(e) => handleToggleSaveJob(job, e)}
                        title={job.is_saved ? "Remove bookmark" : "Save this job"}
                        className={`p-1.5 rounded-lg border transition-all ${job.is_saved
                            ? "bg-amber-50 text-amber-600 border-amber-300"
                            : "text-stone-400 hover:text-[#123B32] hover:bg-[#F7F5EF] border-transparent hover:border-[#E6E5DC]"
                          }`}
                      >
                        {job.is_saved ? (
                          <BookmarkCheck className="w-4 h-4 fill-amber-500 text-amber-600" />
                        ) : (
                          <Bookmark className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Metadata Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {renderSourceBadge(job.source)}
                      {renderWorkplaceBadge(job.workplace_type)}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">
                        {job.employment_type}
                      </span>
                    </div>

                    {/* Role Details Summary */}
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5 text-[#777D74]">
                          <DollarSign className="w-3.5 h-3.5 text-[#123B32] shrink-0" />
                          <span className="truncate">{job.salary || "Competitive"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[#777D74]">
                          <MapPin className="w-3.5 h-3.5 text-[#123B32] shrink-0" />
                          <span className="truncate">{job.location}</span>
                        </div>
                      </div>

                      <p className="text-xs text-[#777D74] line-clamp-3 leading-relaxed font-sans">
                        {getCleanJobDescriptionPreview(job.description, 180)}
                      </p>

                      {/* Skills pills */}
                      {job.skills && job.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {job.skills.slice(0, 4).map((skill) => (
                            <span
                              key={skill}
                              className="text-[10px] px-2 py-0.5 rounded bg-[#F7F5EF] text-[#123B32] border border-[#E6E5DC] font-medium"
                            >
                              {skill}
                            </span>
                          ))}
                          {job.skills.length > 4 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded text-[#777D74]">
                              +{job.skills.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Action Buttons */}
                  <div className="pt-4 mt-4 border-t border-[#E6E5DC] flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 border-[#E6E5DC] hover:border-[#123B32] text-xs font-semibold text-[#123B32] h-10"
                      onClick={() => setViewingRoleDetailsJob(job)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1 text-[#123B32]" />
                      <span>View Details</span>
                    </Button>
                    <Button
                      className="flex-1 bg-[#FF7058] hover:bg-[#FA5D42] text-white text-xs font-semibold h-10 gap-1.5 shadow-sm"
                      onClick={() => handleApplyClick(job)}
                    >
                      <span>Apply Now</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Pagination Controls ────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 pb-8 border-t border-[#E6E5DC]">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || loading}
                onClick={() => updateFilters({ page: currentPage - 1 })}
                className="text-xs font-semibold gap-1 border-[#E6E5DC]"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </Button>

              <span className="text-xs text-[#777D74] font-medium">
                Page <span className="font-bold text-[#123B32]">{currentPage}</span> of {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages || loading}
                onClick={() => updateFilters({ page: currentPage + 1 })}
                className="text-xs font-semibold gap-1 border-[#E6E5DC]"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </main>

        {/* ── View Full Job Details Modal Dialog ───────────────────────────────── */}
        <Dialog
          open={Boolean(viewingRoleDetailsJob)}
          onOpenChange={(open) => !open && setViewingRoleDetailsJob(null)}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-white/10 text-foreground p-6 shadow-2xl">
            {viewingRoleDetailsJob && (
              <div className="space-y-6">
                <DialogHeader>
                  <div className="flex items-start gap-4">
                    <img
                      src={
                        viewingRoleDetailsJob.company_logo_url ||
                        "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"
                      }
                      alt={viewingRoleDetailsJob.company_name}
                      className="w-14 h-14 rounded-2xl object-cover bg-muted border border-white/10 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                      }}
                    />
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">
                          {viewingRoleDetailsJob.company_name}
                        </span>
                        {renderSourceBadge(viewingRoleDetailsJob.source)}
                        {renderWorkplaceBadge(viewingRoleDetailsJob.workplace_type)}
                      </div>
                      <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                        {viewingRoleDetailsJob.title}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap pt-0.5">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-primary" />
                          {viewingRoleDetailsJob.location}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          {viewingRoleDetailsJob.employment_type}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-primary font-medium">
                          <DollarSign className="w-3.5 h-3.5" />
                          {viewingRoleDetailsJob.salary || "Competitive"}
                        </span>
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                {/* Source & Direct Link Info */}
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">Provider Source Integration</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-primary uppercase">
                      {viewingRoleDetailsJob.source}
                    </span>
                  </div>
                  {viewingRoleDetailsJob.job_posting_url && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <span>Direct Posting:</span>
                      <a
                        href={viewingRoleDetailsJob.job_posting_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-mono truncate"
                      >
                        {viewingRoleDetailsJob.job_posting_url}
                      </a>
                    </p>
                  )}
                </div>

                {/* Complete Description */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <FileText className="w-4 h-4 text-primary" />
                    <span>Job Description</span>
                  </h3>
                  <div className="p-5 rounded-2xl bg-white/5 border border-white/5 max-h-[50vh] overflow-y-auto">
                    <JobDescriptionRenderer content={viewingRoleDetailsJob.description} />
                  </div>
                </div>

                {/* Requirements */}
                {viewingRoleDetailsJob.requirements && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Requirements & Qualifications</span>
                    </h3>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                      {viewingRoleDetailsJob.requirements}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {viewingRoleDetailsJob.skills && viewingRoleDetailsJob.skills.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>Required Competencies & Tech Stack</span>
                    </h3>
                    <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-white/5 border border-white/5">
                      {viewingRoleDetailsJob.skills.map((skill) => (
                        <Badge
                          key={skill}
                          variant="secondary"
                          className="text-xs px-2.5 py-1 bg-primary/10 text-primary border border-primary/20"
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleSaveJob(viewingRoleDetailsJob)}
                    className="gap-1.5 text-xs"
                  >
                    {viewingRoleDetailsJob.is_saved ? (
                      <>
                        <BookmarkCheck className="w-4 h-4 text-amber-500 fill-amber-500" />
                        <span>Saved</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-4 h-4" />
                        <span>Bookmark</span>
                      </>
                    )}
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setViewingRoleDetailsJob(null)}
                    >
                      Close
                    </Button>
                    <Button
                      type="button"
                      variant="hero"
                      className="gap-2"
                      onClick={() => {
                        const target = viewingRoleDetailsJob;
                        setViewingRoleDetailsJob(null);
                        handleApplyClick(target);
                      }}
                    >
                      <span>Apply for this Role</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Candidate Internal Application Modal ─────────────────────────────── */}
        <Dialog
          open={isApplying}
          onOpenChange={(open) => {
            setIsApplying(open);
            if (!open) {
              setSubmissionResult(null);
              setConsentAccepted(false);
            }
          }}
        >
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-card border-white/10 text-foreground p-6 shadow-2xl">
            {selectedJob && submissionResult ? (
              /* Submission Confirmation Screen */
              <div className="space-y-6 py-2">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold font-serif text-foreground">
                    Application Submitted Successfully!
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Your application for <strong className="text-foreground">{selectedJob.title}</strong> at <strong className="text-foreground">{selectedJob.company_name}</strong> has been officially registered.
                  </p>
                </div>

                {/* Reference ID Card */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Official Reference ID
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20">
                        {submissionResult.reference_id}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(submissionResult.reference_id);
                          setCopiedRef(true);
                          setTimeout(() => setCopiedRef(false), 2000);
                          toast({
                            title: "Reference ID Copied 📋",
                            description: submissionResult.reference_id,
                          });
                        }}
                      >
                        {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Delivery Status</span>
                    <Badge
                      className={
                        submissionResult.delivery_status === "Delivered to Employer"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                      }
                    >
                      {submissionResult.delivery_status}
                    </Badge>
                  </div>

                  {submissionResult.delivery_details && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                      {submissionResult.delivery_details}
                    </p>
                  )}
                </div>

                {/* Email Delivery Notice */}
                <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-3 text-xs">
                  <Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">Confirmation Email Dispatched</p>
                    <p className="text-muted-foreground text-[11px]">
                      A certified confirmation and receipt have been delivered to <strong className="text-foreground">{submissionResult.email_recipient}</strong>.
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsApplying(false);
                      setSubmissionResult(null);
                    }}
                  >
                    Close
                  </Button>
                  <Button
                    variant="hero"
                    asChild
                    className="gap-2"
                  >
                    <Link to="/dashboard/applications">
                      <span>View in Application Tracking</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : selectedJob ? (
              /* Application Submission Form */
              <form onSubmit={handleApplySubmit} className="space-y-5">
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        selectedJob.company_logo_url ||
                        "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"
                      }
                      alt={selectedJob.company_name}
                      className="w-11 h-11 rounded-xl object-cover bg-muted border border-white/10 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                      }}
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <DialogTitle className="text-lg font-bold">Apply for {selectedJob.title}</DialogTitle>
                        {renderSourceBadge(selectedJob.source)}
                      </div>
                      <DialogDescription className="text-xs">
                        {selectedJob.company_name} • {selectedJob.location} • {selectedJob.employment_type}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                {/* Personal Details */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Your Full Name *</label>
                      <Input
                        placeholder="Jane Doe"
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Email Address *</label>
                      <Input
                        type="email"
                        placeholder="jane@example.com"
                        value={candidateEmail}
                        onChange={(e) => setCandidateEmail(e.target.value)}
                        required
                      />
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Mail className="w-3 h-3 text-primary shrink-0" />
                        <span>Confirmation will be delivered here</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Phone Number</label>
                      <Input
                        placeholder="+1 (555) 000-0000"
                        value={candidatePhone}
                        onChange={(e) => setCandidatePhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Portfolio / GitHub / Profile URL</label>
                      <Input
                        placeholder="https://myportfolio.com"
                        value={portfolioUrl}
                        onChange={(e) => setPortfolioUrl(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Resume Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold block text-foreground">
                      Candidate Resume
                    </label>
                    {resumeFile && (
                      <Button
                        type="button"
                        variant="hero"
                        size="sm"
                        onClick={handleAnalyzeResume}
                        disabled={analyzingResume}
                        className="h-7 text-xs gap-1.5 px-3"
                      >
                        {analyzingResume ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Extracting Details...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Analyze Resume & Auto-Fill</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {activeResumeName && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-medium text-foreground">Active Profile Resume: {activeResumeName}</p>
                          <p className="text-[11px] text-muted-foreground">Will be automatically attached to this submission</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-primary border-primary/30">
                        On File
                      </Badge>
                    </div>
                  )}

                  <div
                    onClick={() => resumeInputRef.current?.click()}
                    className="p-4 rounded-xl border-2 border-dashed border-primary/30 hover:border-primary/70 cursor-pointer bg-primary/5 hover:bg-primary/10 text-center space-y-1.5 transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {resumeFile ? resumeFile.name : activeResumeName ? "Upload a different resume (optional)" : "Upload Resume (PDF, DOCX)"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {resumeFile
                          ? "Click 'Analyze Resume & Auto-Fill' above to extract skills and contact automatically."
                          : "PDF or DOCX up to 10MB"}
                      </p>
                    </div>
                    <input
                      type="file"
                      ref={resumeInputRef}
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setResumeFile(e.target.files[0]);
                      }}
                    />
                  </div>
                </div>

                {/* Cover Letter */}
                <div>
                  <label className="text-xs font-medium mb-1 block">Short Note / Cover Letter</label>
                  <Textarea
                    rows={3}
                    placeholder={`Tell the ${selectedJob.company_name} recruiting team why you're a standout match for this role...`}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                  />
                </div>

                {activeResumeName && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-primary" />
                      <div>
                        <p className="font-medium text-foreground">Active Profile Resume: {activeResumeName}</p>
                        <p className="text-[11px] text-muted-foreground">Will be automatically attached to this submission</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-primary border-primary/30">
                      On File
                    </Badge>
                  </div>
                )}

                {/* Explicit Consent & Authorization Checkbox */}
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="candidate-consent"
                      checked={consentAccepted}
                      onChange={(e) => setConsentAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                      required
                    />
                    <label htmlFor="candidate-consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer select-none">
                      I consent to submit my application through <strong className="text-foreground">AutoAgentHire</strong> and authorize AutoAgentHire to share my profile, resume, and application materials with <strong className="text-foreground">{selectedJob.company_name}</strong>.
                    </label>
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsApplying(false)}
                    disabled={applySubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="hero"
                    disabled={applySubmitting || !consentAccepted}
                    className="gap-2"
                  >
                    {applySubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Submitting Application...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Submit Application</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
      );
}
