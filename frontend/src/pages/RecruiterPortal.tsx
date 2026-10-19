import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Briefcase, Send, Users, Clock, DollarSign, Calendar, MapPin, Building2,
  FileText, ExternalLink, CheckCircle2, AlertCircle, Plus, Eye, Search,
  ChevronRight, ArrowUpRight, Filter, Download, UserCheck, ShieldCheck, ShieldAlert, LogOut,
  LayoutDashboard, Sparkles, TrendingUp, Settings, Lock, Edit3, Camera, GraduationCap,
  Award, Phone, Mail, User, Loader2, Video, Link2, Copy, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiClient, API_ENDPOINTS, API_BASE_URL, getAuthenticatedFileUrl } from "@/lib/api";
import { jobsService } from "@/services/jobsService";
import { applicationsService } from "@/services/applicationsService";
import { companiesService } from "@/services/companiesService";
import { authService } from "@/services/authService";
import { useToast } from "@/hooks/use-toast";

const PERSONAL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com",
  "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "zoho.com", "proton.me", "protonmail.com", "mail.com", "gmx.com",
  "yandex.com", "mail.ru", "inbox.com"
];

const isPersonalEmail = (email: string) => {
  if (!email || !email.includes("@")) return false;
  const domain = email.split("@").pop()?.trim().toLowerCase() || "";
  return PERSONAL_DOMAINS.includes(domain);
};

const getISTDateTimeString = (daysOffset: number = 0, hour: number = 9, minute: number = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${mins}`;
};

interface JobPosting {
  id: number;
  uuid: string;
  title: string;
  company_name: string;
  company_logo_url?: string;
  organization_symbol?: string;
  vacancies: number;
  salary_description: string;
  job_type: string;
  location: string;
  description: string;
  requirements?: string;
  skills?: string;
  recruiting_process?: string;
  start_date_pt: string;
  final_date_pt: string;
  timezone: string;
  status: string;
  authorizer_notes?: string;
  created_at?: string;
  applications_count?: number;
}

interface CandidateApplication {
  id: number;
  uuid: string;
  job_posting_id: number;
  job_title?: string;
  company_name?: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  profile_url?: string;
  portfolio_url?: string;
  resume_url?: string;
  resume_filename?: string;
  cv_url?: string;
  cv_filename?: string;
  cover_letter?: string;
  notes?: string;
  status: string;
  recruiter_notes?: string;
  match_score?: number;
  interview_scheduled_at?: string;
  interview_meeting_link?: string;
  interview_round?: string;
  interview_notes?: string;
  created_at?: string;
}

export default function RecruiterPortal() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // Active section: 'dashboard' | 'post' | 'tracking' | 'settings'
  const [activeTab, setActiveTab] = useState<"dashboard" | "post" | "tracking" | "settings">("dashboard");
  const [trackingSubTab, setTrackingSubTab] = useState<"jobs" | "applications">("jobs");

  // Recruiter Password Change State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Resume inspection parsed preview state
  const [parsingInspectResume, setParsingInspectResume] = useState(false);
  const [parsedCandidateResume, setParsedCandidateResume] = useState<any>(null);

  // Recruiter info & authorization state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [approvalStatus, setApprovalStatus] = useState<string>("approved");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [recruiterProfileForm, setRecruiterProfileForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    avatar_url: "",
    education: "",
    qualification: "",
    job_role: "",
    company_name: "",
    location: "",
  });

  // Official Email Change Verification Process State
  const [isVerifyEmailOpen, setIsVerifyEmailOpen] = useState(false);
  const [pendingEmailToVerify, setPendingEmailToVerify] = useState("");
  const [verificationOtpCode, setVerificationOtpCode] = useState("");
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Interview Scheduling State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleCandidate, setScheduleCandidate] = useState<CandidateApplication | null>(null);
  const [schedulingApp, setSchedulingApp] = useState(false);
  const [interviewForm, setInterviewForm] = useState({
    scheduled_at: "",
    meeting_link: "",
    round: "Technical Interview Round 1",
    notes: "",
  });

  // Available skills from platform
  const availablePlatformSkills = [
    "React", "TypeScript", "JavaScript", "Python", "FastAPI", "Node.js", "Next.js",
    "Tailwind CSS", "Go", "Golang", "Docker", "Kubernetes", "AWS", "GCP", "PostgreSQL",
    "MongoDB", "Redis", "Kafka", "PyTorch", "TensorFlow", "LangChain", "OpenAI",
    "LLM", "RAG", "SQL", "Snowflake", "dbt", "Apache Spark", "Airflow", "Figma",
    "UI/UX Design", "GraphQL", "REST APIs", "Playwright", "Cypress", "Selenium",
    "CI/CD", "Terraform", "Linux", "Microservices", "Git", "Tableau", "PowerBI"
  ];

  // Post Job Form State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [jobForm, setJobForm] = useState({
    title: "",
    vacancies: 1,
    salary_description: "$120,000 - $145,000 / year",
    job_type: "Full-time",
    location: "Remote (India / Global)",
    description: "",
    requirements: "",
    skills: "",
    recruiting_process: "",
    start_date_pt: getISTDateTimeString(0, 9, 0),
    final_date_pt: getISTDateTimeString(30, 18, 0),
    company_name: "",
    company_logo_url: "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop",
    organization_symbol: "TECH",
  });

  // Tracking State
  const [jobsList, setJobsList] = useState<JobPosting[]>([]);
  const [applicationsList, setApplicationsList] = useState<CandidateApplication[]>([]);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateApplication | null>(null);
  const [candidateFilter, setCandidateFilter] = useState("all");

  // Fetch current user & initial data with robust session verification
  useEffect(() => {
    let isMounted = true;

    const initPortal = async () => {
      const token = localStorage.getItem("authToken");

      // If unauthenticated, redirect to login immediately without firing unauthorized requests
      if (!token) {
        if (isMounted) {
          navigate("/login", { replace: true });
        }
        return;
      }

      // 2. Fetch authenticated profile to verify role and approval status
      try {
        const resp = await apiClient.get(API_ENDPOINTS.auth.me);
        const userData = resp.data;
        if (!isMounted) return;

        setCurrentUser(userData);

        // Enforce role boundary: Prevent candidates/clients and authorizers from recruiter portal
        if (userData.role === "candidate" || userData.role === "client") {
          navigate("/dashboard", { replace: true });
          return;
        }
        if (userData.role === "authorizer") {
          navigate("/authorizer", { replace: true });
          return;
        }
        if (userData.role !== "recruiter" && userData.role !== "admin") {
          navigate("/dashboard", { replace: true });
          return;
        }

        // Check recruiter approval status
        const status = userData.approval_status || "pending_approval";
        setApprovalStatus(status);

        if (userData.company_name) {
          setJobForm(prev => ({
            ...prev,
            company_name: userData.company_name,
            company_logo_url: userData.company_logo_url || prev.company_logo_url,
            organization_symbol: userData.company_name.slice(0, 4).toUpperCase(),
          }));
        }

        // 3. ONLY load tracking data if approved recruiter!
        if (status === "approved") {
          await loadTrackingData(userData);
        }
      } catch (err: any) {
        if (!isMounted) return;
        const statusCode = err?.response?.status;
        if (statusCode === 401 || statusCode === 403) {
          localStorage.removeItem("authToken");
          localStorage.removeItem("userRole");
          navigate("/login", { replace: true });
          return;
        }
      } finally {
        if (isMounted) {
          setAuthChecking(false);
        }
      }
    };

    initPortal();

    // Listen for auth state changes (e.g. sign out or session refresh)
    const authListener = authService.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || !localStorage.getItem("authToken")) {
        navigate("/login", { replace: true });
      }
    });

    return () => {
      isMounted = false;
      authListener?.data?.subscription?.unsubscribe();
    };
  }, []);

  const toggleSkill = (skill: string) => {
    const currentSkills = jobForm.skills
      ? jobForm.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const exists = currentSkills.some((s) => s.toLowerCase() === skill.toLowerCase());
    let nextSkills: string[];
    if (exists) {
      nextSkills = currentSkills.filter((s) => s.toLowerCase() !== skill.toLowerCase());
    } else {
      nextSkills = [...currentSkills, skill];
    }
    setJobForm((prev) => ({ ...prev, skills: nextSkills.join(", ") }));
  };

  const handleAddCustomSkill = () => {
    const trimmed = customSkillInput.trim();
    if (!trimmed) return;
    const currentSkills = jobForm.skills
      ? jobForm.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (!currentSkills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setJobForm((prev) => ({ ...prev, skills: [...currentSkills, trimmed].join(", ") }));
    }
    setCustomSkillInput("");
  };

  const loadTrackingData = async (userObj?: any) => {
    setLoadingTracking(true);
    try {
      const [jobsResp, appsResp] = await Promise.all([
        apiClient.get(API_ENDPOINTS.recruiter.myJobs).catch(() => ({ data: [] })),
        apiClient.get(API_ENDPOINTS.recruiter.myApplications).catch(() => ({ data: [] })),
      ]);

      setJobsList(jobsResp.data || []);
      setApplicationsList(appsResp.data || []);
    } catch (err: any) {
      console.warn("Tracking data fetch notice:", err?.message);
    } finally {
      setLoadingTracking(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobForm.title || !jobForm.salary_description || !jobForm.description) {
      toast({
        title: "Missing fields",
        description: "Please fill in the Job Title, Salary Description, and Description",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.recruiter.createJob, jobForm);

      toast({
        title: "Job Posted Successfully! 🎉",
        description: "Your job vacancy is live and displayed in the Client Portal Browse Jobs section.",
      });
      window.dispatchEvent(new Event("jobPostingsUpdated"));
      loadTrackingData();
      setActiveTab("tracking");
      setTrackingSubTab("jobs");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Failed to post job. Please try again.";
      toast({
        title: "Submission failed",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteJob = async (jobId: number, jobTitle: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete the job vacancy "${jobTitle}"? This will also remove any candidate applications associated with this posting.`)) {
      return;
    }
    try {
      await apiClient.delete(API_ENDPOINTS.recruiter.deleteJob(jobId));
      toast({
        title: "Job Vacancy Deleted 🗑️",
        description: `Successfully deleted "${jobTitle}" from job postings.`,
      });
      window.dispatchEvent(new Event("jobPostingsUpdated"));
      loadTrackingData();
    } catch (err: any) {
      if (err?.response?.status === 401) {
        // Centralized session expiry interceptor handles token removal and redirect notice
        return;
      }
      toast({
        title: "Failed to Delete Job",
        description: err?.response?.data?.detail || err?.message || "Could not delete job vacancy.",
        variant: "destructive",
      });
    }
  };

  const handleOpenScheduleModal = (candidate: CandidateApplication) => {
    setScheduleCandidate(candidate);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const tzOffset = tomorrow.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(tomorrow.getTime() - tzOffset)).toISOString().slice(0, 16);

    const randMeetCode = `${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`;
    setInterviewForm({
      scheduled_at: candidate.interview_scheduled_at ? new Date(candidate.interview_scheduled_at).toISOString().slice(0, 16) : localISOTime,
      meeting_link: (candidate.interview_meeting_link && !candidate.interview_meeting_link.endsWith('/new')) 
        ? candidate.interview_meeting_link 
        : `https://meet.google.com/${randMeetCode}`,
      round: candidate.interview_round || "Technical Interview Round 1",
      notes: candidate.interview_notes || candidate.recruiter_notes || "Please join with webcam and microphone ready. Interview will be conducted via Google Meet.",
    });
    setIsScheduleModalOpen(true);
  };

  const handleConfirmScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleCandidate) return;
    setSchedulingApp(true);
    try {
      await apiClient.put(API_ENDPOINTS.recruiter.updateApplicationStatus(scheduleCandidate.id), {
        status: "interview",
        interview_scheduled_at: interviewForm.scheduled_at ? new Date(interviewForm.scheduled_at).toISOString() : null,
        interview_meeting_link: interviewForm.meeting_link.trim(),
        interview_round: interviewForm.round.trim(),
        recruiter_notes: interviewForm.notes.trim(),
      });

      toast({
        title: "Interview Scheduled! 📅",
        description: `Scheduled ${interviewForm.round} for ${scheduleCandidate.candidate_name}. Meeting link is live in Candidate Portal.`,
      });

      setIsScheduleModalOpen(false);
      loadTrackingData();
      if (selectedCandidate && selectedCandidate.id === scheduleCandidate.id) {
        setSelectedCandidate(prev => prev ? {
          ...prev,
          status: "interview",
          interview_scheduled_at: interviewForm.scheduled_at,
          interview_meeting_link: interviewForm.meeting_link.trim(),
          interview_round: interviewForm.round.trim(),
          recruiter_notes: interviewForm.notes.trim(),
        } : null);
      }
    } catch (err: any) {
      toast({
        title: "Scheduling Failed",
        description: err?.response?.data?.detail || err?.message || "Could not schedule interview",
        variant: "destructive",
      });
    } finally {
      setSchedulingApp(false);
    }
  };

  const handleUpdateAppStatus = async (appId: number, newStatus: string) => {
    if (newStatus === "interview") {
      const targetApp = applicationsList.find(a => a.id === appId) || selectedCandidate;
      if (targetApp) {
        handleOpenScheduleModal(targetApp);
        return;
      }
    }

    try {
      const resp = await apiClient.put(API_ENDPOINTS.recruiter.updateApplicationStatus(appId), {
        status: newStatus,
      });

      const meetLink = resp.data?.interview_meeting_link;
      const targetEmail = resp.data?.email_recipient || selectedCandidate?.candidate_email || "candidate";

      if (newStatus === "shortlisted") {
        toast({
          title: "Candidate Shortlisted! 🎉",
          description: `Google Meet link generated (${meetLink || 'Active'}) and personalized email dispatched to ${targetEmail}.`,
        });
      } else {
        toast({
          title: `Status: ${newStatus.toUpperCase()}`,
          description: `Application updated to ${newStatus}. Personalized notification email dispatched to ${targetEmail}.`,
        });
      }

      loadTrackingData();
      if (selectedCandidate && selectedCandidate.id === appId) {
        setSelectedCandidate(prev => prev ? {
          ...prev,
          status: newStatus,
          interview_meeting_link: meetLink || prev.interview_meeting_link,
        } : null);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        // Centralized session expiry interceptor handles token removal and redirect notice
        return;
      }
      toast({
        title: "Failed to update",
        description: err?.response?.data?.detail || err?.message || "Could not update status",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await authService.signOut();
    navigate("/login");
  };

  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    try {
      const resp = await apiClient.get(API_ENDPOINTS.auth.me);
      const updatedUser = resp.data;
      if (updatedUser.approval_status === "approved") {
        setCurrentUser(updatedUser);
        setApprovalStatus("approved");
        await loadTrackingData(updatedUser);
        toast({
          title: "Access Approved! 🎉",
          description: "Your recruiter access request has been approved by the Authorizer team.",
        });
      } else {
        toast({
          title: "Status: " + (updatedUser.approval_status ? updatedUser.approval_status.replace('_', ' ') : "Pending Approval"),
          description: "Your recruiter registration is still awaiting authorizer approval.",
        });
      }
    } catch {
      window.location.reload();
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleOpenEditProfile = () => {
    setRecruiterProfileForm({
      full_name: currentUser?.full_name || "",
      email: currentUser?.email || "",
      phone: currentUser?.phone || "+1 (555) 019-2834",
      avatar_url: currentUser?.avatar_url || currentUser?.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop",
      education: currentUser?.education || "Bachelor of Business Administration / HR Management",
      qualification: currentUser?.qualification || "MBA / Certified Talent Acquisition Specialist",
      job_role: currentUser?.job_role || "Senior Technical Recruiter",
      company_name: currentUser?.company_name || jobForm.company_name || "",
      location: currentUser?.location || "Remote / Corporate Office",
    });
    setIsEditProfileOpen(true);
  };

  const handleInitiateEmailVerification = async (targetEmail: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      toast({
        title: "Official Email Required",
        description: "Please enter your official corporate email address.",
        variant: "destructive",
      });
      return false;
    }

    if (isPersonalEmail(cleanEmail)) {
      toast({
        title: "Official Corporate Email Required",
        description: "Personal email domains (gmail, yahoo, etc.) are strictly prohibited. Please provide an official corporate or company email address.",
        variant: "destructive",
      });
      return false;
    }

    setIsRequestingOtp(true);
    try {
      const resp = await apiClient.post(API_ENDPOINTS.settings.requestEmailVerification, {
        new_email: cleanEmail,
      });

      setPendingEmailToVerify(cleanEmail);
      setVerificationOtpCode("");
      setIsVerifyEmailOpen(true);
      toast({
        title: "Verification Code Sent 📨",
        description: `A 6-digit verification code has been dispatched to ${cleanEmail}.`,
      });
      return true;
    } catch (err: any) {
      toast({
        title: "Verification Request Failed",
        description: err?.response?.data?.detail || err?.message || "Failed to dispatch verification code",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleConfirmEmailVerification = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!verificationOtpCode.trim() || verificationOtpCode.trim().length < 6) {
      toast({
        title: "Verification Code Incomplete",
        description: "Please enter the complete 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const verifyResp = await apiClient.post(API_ENDPOINTS.settings.verifyEmailCode, {
        new_email: pendingEmailToVerify,
        code: verificationOtpCode.trim(),
      });

      // Save remaining profile details
      const updatedProfilePayload = {
        ...recruiterProfileForm,
        email: pendingEmailToVerify,
      };
      await apiClient.post(API_ENDPOINTS.settings.updateProfile, updatedProfilePayload);

      setCurrentUser((prev: any) => ({
        ...prev,
        ...updatedProfilePayload,
        email: verifyResp.data?.user?.email || pendingEmailToVerify,
      }));
      setRecruiterProfileForm(updatedProfilePayload);

      if (updatedProfilePayload.company_name) {
        setJobForm(prev => ({
          ...prev,
          company_name: updatedProfilePayload.company_name,
          organization_symbol: updatedProfilePayload.company_name.slice(0, 4).toUpperCase(),
        }));
      }

      setIsVerifyEmailOpen(false);
      setIsEditProfileOpen(false);
      setVerificationOtpCode("");
      setPendingEmailToVerify("");

      toast({
        title: "Official Email Verified & Saved! ✨",
        description: `Your official Recruiter email has been updated to ${verifyResp.data?.user?.email || pendingEmailToVerify}.`,
      });
    } catch (err: any) {
      toast({
        title: "Verification Failed",
        description: err?.response?.data?.detail || err?.message || "Invalid or expired verification code",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSaveRecruiterProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = (recruiterProfileForm.email || "").trim().toLowerCase();
    if (!cleanEmail) {
      toast({
        title: "Official Email Required",
        description: "Official Recruiter company email address cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    if (isPersonalEmail(cleanEmail)) {
      toast({
        title: "Official Corporate Email Required",
        description: "Recruiter accounts must use an official corporate or company email address. Personal email domains (gmail, yahoo, etc.) are strictly prohibited.",
        variant: "destructive",
      });
      return;
    }

    const currentEmail = (currentUser?.email || "").trim().toLowerCase();
    const isEmailChanging = cleanEmail !== currentEmail;

    if (isEmailChanging) {
      // Initiate official verification process!
      await handleInitiateEmailVerification(cleanEmail);
      return;
    }

    setSavingProfile(true);
    try {
      const resp = await apiClient.post(API_ENDPOINTS.settings.updateProfile, recruiterProfileForm);
      setCurrentUser((prev: any) => ({
        ...prev,
        ...recruiterProfileForm,
        email: resp.data?.user?.email || recruiterProfileForm.email,
      }));
      if (recruiterProfileForm.company_name) {
        setJobForm(prev => ({
          ...prev,
          company_name: recruiterProfileForm.company_name,
          organization_symbol: recruiterProfileForm.company_name.slice(0, 4).toUpperCase(),
        }));
      }
      setIsEditProfileOpen(false);
      toast({
        title: "Profile Updated Successfully! ✨",
        description: "Your recruiter organization profile details have been saved.",
      });
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err?.response?.data?.detail || err?.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRecruiterChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Missing Fields",
        description: "Please enter your current password, new password, and confirm new password.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords Do Not Match",
        description: "New password and confirmation password do not match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "New password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const resp = await apiClient.post(API_ENDPOINTS.auth.changePassword, {
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast({
        title: "Password Updated",
        description: resp.data.message || "Your password has been changed successfully.",
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to change password. Please check your old password.";
      toast({
        title: "Update Failed",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleInspectCandidate = async (app: CandidateApplication) => {
    setSelectedCandidate(app);
    setParsedCandidateResume(null);
    setParsingInspectResume(true);

    try {
      // 1. Try direct server-side AI resume analysis first
      try {
        const resp = await apiClient.get<any>(`/api/recruiter/applications/${app.id}/analyze-resume`);
        if (resp.data && resp.data.parsed_data) {
          setParsedCandidateResume(resp.data.parsed_data);
          toast({
            title: "Resume Analyzed Successfully! ✨",
            description: `Extracted ${(resp.data.parsed_data.skills || []).length} candidate skills & background details.`,
          });
          return;
        }
      } catch (srvErr) {
        console.warn("Direct server resume analysis failed, trying file download fallback:", srvErr);
      }

      // 2. Fallback: Fetch document via URL and submit to ATS parser
      if (app.resume_url) {
        const fileUrl = getAuthenticatedFileUrl(app.resume_url);
        const token = localStorage.getItem('authToken');
        const fileResp = await fetch(fileUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (fileResp.ok) {
          const blob = await fileResp.blob();
          const parseData = new FormData();
          parseData.append("file", blob, app.resume_filename || "resume.pdf");
          const parseResult = await apiClient.postFormData<any>(API_ENDPOINTS.ats.parseResume, parseData);
          const parsed = parseResult.data?.parsed_data || parseResult.data;
          if (parsed) {
            setParsedCandidateResume(parsed);
            toast({
              title: "Resume Analyzed Successfully! ✨",
              description: `Extracted ${(parsed.skills || []).length} candidate skills & background details.`,
            });
            return;
          }
        }
      }

      toast({
        title: "Analysis Notice",
        description: "Resume analysis complete from candidate application records.",
      });
    } catch (err: any) {
      console.warn("Could not parse candidate resume for preview:", err);
      toast({
        title: "Resume Analysis Failed",
        description: err?.message || "Could not analyze resume document",
        variant: "destructive",
      });
    } finally {
      setParsingInspectResume(false);
    }
  };

  const filteredApps = applicationsList.filter(app => {
    if (candidateFilter === "all") return true;
    return app.status === candidateFilter;
  });

  if (authChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground font-medium">Verifying recruiter authorization...</p>
        </div>
      </div>
    );
  }

  if (approvalStatus === "pending_approval" || approvalStatus === "rejected") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-2xl bg-card border border-border shadow-xl text-center space-y-6">
          <div className={`w-16 h-16 rounded-2xl ${approvalStatus === 'pending_approval' ? 'bg-amber-500/10 text-amber-500' : 'bg-destructive/10 text-destructive'} mx-auto flex items-center justify-center`}>
            {approvalStatus === 'pending_approval' ? (
              <ShieldAlert className="w-8 h-8" />
            ) : (
              <AlertCircle className="w-8 h-8" />
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">
              {approvalStatus === "pending_approval"
                ? "Account Pending Approval"
                : "Recruiter Access Not Approved"}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {approvalStatus === "pending_approval"
                ? "Your recruiter registration is currently under review by our platform Authorizer team. Once approved, you'll be granted full access to post vacancies and review candidates."
                : "Your recruiter account application was not approved. Please reach out to your organization administrator or platform Authorizer for assistance."}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account:</span>
              <span className="font-medium text-foreground">{currentUser?.email}</span>
            </div>
            {currentUser?.company_name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Organization:</span>
                <span className="font-medium text-foreground">{currentUser?.company_name}</span>
              </div>
            )}
            {currentUser?.custom_user_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recruiter ID:</span>
                <span className="font-mono font-semibold text-primary">{currentUser?.custom_user_id}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className={`capitalize font-semibold ${approvalStatus === 'pending_approval' ? 'text-amber-400' : 'text-destructive'}`}>
                {approvalStatus.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <Button
              variant="outline"
              onClick={handleLogout}
              className="flex-1"
            >
              Sign Out
            </Button>
            <Button
              onClick={handleCheckStatus}
              disabled={checkingStatus}
              className="flex-1 bg-primary text-primary-foreground gap-1.5"
            >
              {checkingStatus ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Check Status</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Horizontal Sidebar Navigation */}
      <aside className="w-full md:w-64 lg:w-72 border-r border-white/10 bg-card/60 backdrop-blur-xl flex flex-col shrink-0 sticky top-0 md:h-screen z-30">
        {/* Brand Header */}
        <div className="h-16 border-b border-white/10 px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center font-bold text-white shadow-lg shadow-primary/25">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block">AutoAgentHire</span>
              <span className="text-[10px] text-primary font-semibold tracking-wider uppercase">Recruiter Workspace</span>
            </div>
          </Link>
        </div>

        {/* Sidebar Navigation Items */}
        <div className="p-4 space-y-1.5 flex-1">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Navigation Menu
          </div>

          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === "dashboard"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="flex-1 text-left">Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("post")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === "post"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="flex-1 text-left">Post Job</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("tracking");
              loadTrackingData();
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === "tracking"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="flex-1 text-left">Jobs Tracking</span>
            {applicationsList.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-white font-bold text-[10px]">
                {applicationsList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === "settings"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="flex-1 text-left">Profile & Settings</span>
          </button>

          <div className="pt-3 border-t border-white/5">
            <Link
              to="/candidate/jobs"
              target="_blank"
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-primary hover:bg-primary/10 border border-primary/20 transition-all"
            >
              <ExternalLink className="w-4 h-4 text-primary" />
              <span className="flex-1 text-left">Candidate Job Board</span>
            </Link>
          </div>
        </div>

        {/* Recruiter Profile / User ID info & Logout */}
        <div className="p-4 border-t border-white/10 bg-black/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={currentUser?.company_logo_url || jobForm.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                alt="Logo"
                className="w-8 h-8 rounded-lg object-cover bg-card border border-white/10 shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                }}
              />
              <div className="min-w-0">
                <span className="text-xs font-semibold block text-foreground truncate leading-none">
                  {currentUser?.company_name || currentUser?.full_name || "Recruiter"}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block truncate">
                  {currentUser?.custom_user_id ? `ID: ${currentUser.custom_user_id}` : currentUser?.email || "REC-1001"}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive h-8 w-8 p-0 shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 max-w-7xl">
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: DASHBOARD                                                    */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "dashboard" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {/* Header Hero Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 md:p-8 rounded-3xl bg-gradient-to-r from-primary/10 via-card to-card border border-primary/20">
              <div className="flex items-center gap-4">
                <img
                  src={currentUser?.company_logo_url || jobForm.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                  alt="Company Logo"
                  className="w-16 h-16 rounded-2xl object-cover bg-card border border-white/10 shadow-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                  }}
                />
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-1 border border-primary/20">
                    <Building2 className="w-3.5 h-3.5" />
                    Verified Recruiter Account
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                    {currentUser?.company_name || "Organization"} Recruiter Portal
                  </h1>
                  <p className="text-muted-foreground text-xs md:text-sm mt-0.5">
                    Logged in as <span className="text-foreground font-medium">{currentUser?.full_name || currentUser?.email || "Recruiter"}</span> • Pacific Time Scheduling Active
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setActiveTab("post")}
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/25"
                >
                  <Plus className="w-4 h-4" />
                  Post New Vacancy
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setActiveTab("tracking");
                    loadTrackingData();
                  }}
                  className="gap-2 border-white/10 hover:bg-white/5"
                >
                  <Clock className="w-4 h-4" />
                  Tracking & Applications
                </Button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card variant="glass" className="border-white/10 hover:border-primary/30 transition-all">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">Total Jobs Posted</span>
                    <span className="text-2xl font-bold mt-1 block text-foreground">{jobsList.length}</span>
                    <span className="text-[11px] text-muted-foreground">Across all departments</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Briefcase className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10 hover:border-primary/30 transition-all">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">Approved & Live Vacancies</span>
                    <span className="text-2xl font-bold mt-1 block text-emerald-400">
                      {jobsList.filter(j => j.status === "approved").reduce((acc, curr) => acc + (curr.vacancies || 1), 0)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Visible on candidate board</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10 hover:border-primary/30 transition-all">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">Candidate Applications</span>
                    <span className="text-2xl font-bold mt-1 block text-blue-400">{applicationsList.length}</span>
                    <span className="text-[11px] text-muted-foreground">Total CVs received</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                    <Users className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10 hover:border-primary/30 transition-all">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">Pending Candidate Review</span>
                    <span className="text-2xl font-bold mt-1 block text-amber-400">
                      {applicationsList.filter(a => a.status === "pending" || a.status === "reviewing").length}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Awaiting evaluation</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Clock className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Overview Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Job Postings Overview */}
              <Card variant="glass" className="border-white/10">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Your Job Postings</CardTitle>
                    <CardDescription className="text-xs">Recent vacancy listings and authorization status</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveTab("tracking");
                      setTrackingSubTab("jobs");
                    }}
                    className="text-xs text-primary hover:text-primary/80"
                  >
                    View All ({jobsList.length})
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {jobsList.slice(0, 4).map((j) => (
                    <div key={j.id} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-foreground truncate">{j.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {j.vacancies} open position(s) • {j.salary_description}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${
                          j.status === "approved"
                            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                            : j.status === "rejected"
                            ? "border-destructive/40 text-destructive bg-destructive/10"
                            : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                        }`}
                      >
                        {j.status.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                  {jobsList.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-xs text-muted-foreground mb-3">No job postings created yet.</p>
                      <Button size="sm" onClick={() => setActiveTab("post")}>
                        Create Your First Job
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Applications Overview */}
              <Card variant="glass" className="border-white/10">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Recent Candidate Applications</CardTitle>
                    <CardDescription className="text-xs">Candidates who uploaded CVs for your positions</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveTab("tracking");
                      setTrackingSubTab("applications");
                    }}
                    className="text-xs text-primary hover:text-primary/80"
                  >
                    View All ({applicationsList.length})
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {applicationsList.slice(0, 4).map((app) => (
                    <div key={app.id} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-foreground truncate">{app.candidate_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{app.candidate_email} • {app.job_title || "Application"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                          Match: {Math.round((app.match_score || 0.9) * 100)}%
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            handleInspectCandidate(app);
                            setActiveTab("tracking");
                            setTrackingSubTab("applications");
                          }}
                          className="text-xs h-7 px-2"
                        >
                          Inspect
                        </Button>
                      </div>
                    </div>
                  ))}
                  {applicationsList.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-xs text-muted-foreground">No candidate applications received yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: POST JOB SECTION                                            */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "post" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Post a New Vacancy</h1>
                <p className="text-muted-foreground mt-1">
                  Create and publish a verified job listing for prospective candidates across Pacific Time windows.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  asChild
                  className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Link to="/candidate/jobs" target="_blank">
                    <ExternalLink className="w-4 h-4" />
                    Preview Live Board
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setActiveTab("tracking");
                    loadTrackingData();
                  }}
                  className="gap-2"
                >
                  <Clock className="w-4 h-4" />
                  Go to Tracking Section
                </Button>
              </div>
            </div>

            <form onSubmit={handleCreateJob} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Organization & Identity */}
              <div className="space-y-6">
                <Card variant="glass">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-primary" />
                      Organization Identity
                    </CardTitle>
                    <CardDescription>
                      The recruiter represents the organization with logo & symbol
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Company / Organization Name *</label>
                      <Input
                        placeholder="e.g. Acme Cloud Systems"
                        value={jobForm.company_name}
                        onChange={(e) => setJobForm({ ...jobForm, company_name: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Organization Symbol / Ticker</label>
                      <Input
                        placeholder="e.g. ACME, TECH, GOOG"
                        value={jobForm.organization_symbol}
                        onChange={(e) => setJobForm({ ...jobForm, organization_symbol: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Displayed as a badge beside your job title</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Company Logo URL / Symbol</label>
                      <Input
                        placeholder="https://..."
                        value={jobForm.company_logo_url}
                        onChange={(e) => setJobForm({ ...jobForm, company_logo_url: e.target.value })}
                      />
                    </div>

                    {/* Logo Preview Card */}
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                      <img
                        src={jobForm.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                        alt="Logo Preview"
                        className="w-12 h-12 rounded-xl object-cover bg-muted border border-white/10"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                        }}
                      />
                      <div className="overflow-hidden">
                        <div className="font-semibold text-sm truncate">{jobForm.company_name || "Company Name"}</div>
                        <Badge variant="secondary" className="text-xs font-mono mt-0.5">
                          {jobForm.organization_symbol || "SYMBOL"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Indian Standard Time Window Notice Card */}
                <Card variant="glass" className="border-amber-500/20 bg-amber-500/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-400">
                      <Calendar className="w-4 h-4" />
                      Indian Standard Time (IST) Requirement
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-2">
                    <p>
                      All applications open and close strictly indexed against <strong>Indian Standard Time (IST)</strong>.
                    </p>
                    <p className="text-amber-300 font-mono">Timezone: Asia/Kolkata (IST, UTC+05:30)</p>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Job Details Form */}
              <div className="lg:col-span-2 space-y-6">
                <Card variant="glass">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      Job Vacancy Details
                    </CardTitle>
                    <CardDescription>
                      Specify job parameters, compensation, and Pacific Time application window
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Job Title & Vacancies */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium mb-1.5 block">Job Title *</label>
                        <Input
                          placeholder="e.g. Senior Full Stack Engineer / AI Specialist"
                          value={jobForm.title}
                          onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Vacancies Count *</label>
                        <div className="relative">
                          <Users className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                          <Input
                            type="number"
                            min="1"
                            className="pl-9"
                            value={jobForm.vacancies}
                            onChange={(e) => setJobForm({ ...jobForm, vacancies: parseInt(e.target.value) || 1 })}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    {/* Salary Description & Job Type & Location */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Salary Description *</label>
                        <div className="relative">
                          <DollarSign className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                          <Input
                            className="pl-9"
                            placeholder="e.g. $130k - $160k / yr"
                            value={jobForm.salary_description}
                            onChange={(e) => setJobForm({ ...jobForm, salary_description: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Job Type</label>
                        <select
                          value={jobForm.job_type}
                          onChange={(e) => setJobForm({ ...jobForm, job_type: e.target.value })}
                          className="w-full h-10 px-3 rounded-md bg-background border border-input text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="Full-time">Full-time</option>
                          <option value="Part-time">Part-time</option>
                          <option value="Contract">Contract</option>
                          <option value="Remote">Remote</option>
                          <option value="Hybrid">Hybrid</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Location</label>
                        <div className="relative">
                          <MapPin className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                          <Input
                            className="pl-9"
                            placeholder="e.g. Remote (US/Canada)"
                            value={jobForm.location}
                            onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Indian Standard Time Application Window */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-primary" />
                          Application Starting Date & Time (IST) *
                        </label>
                        <Input
                          type="datetime-local"
                          value={jobForm.start_date_pt}
                          onChange={(e) => setJobForm({ ...jobForm, start_date_pt: e.target.value })}
                          required
                          className="bg-black/30 border-white/10"
                        />
                        <span className="text-xs text-muted-foreground mt-1 block">Pick start date and time (Indian Standard Time)</span>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-destructive" />
                          Final Application Closing Date & Time (IST) *
                        </label>
                        <Input
                          type="datetime-local"
                          value={jobForm.final_date_pt}
                          onChange={(e) => setJobForm({ ...jobForm, final_date_pt: e.target.value })}
                          required
                          className="bg-black/30 border-white/10"
                        />
                        <span className="text-xs text-muted-foreground mt-1 block">Pick finish date and time (Indian Standard Time)</span>
                      </div>
                    </div>

                    {/* Job Description */}
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Job Description & Responsibilities *</label>
                      <Textarea
                        rows={5}
                        placeholder="Describe the role, key responsibilities, team environment, and day-to-day work..."
                        value={jobForm.description}
                        onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                        required
                      />
                    </div>

                    {/* Requirements */}
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Candidate Requirements & Qualifications</label>
                      <Textarea
                        rows={3}
                        placeholder="e.g. 4+ years React/Node.js, experience with AI tooling, Bachelor's degree..."
                        value={jobForm.requirements}
                        onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })}
                      />
                    </div>

                    {/* Required Technical Skills (Skill Section) */}
                    <div className="space-y-3 p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold flex items-center gap-2 text-primary">
                          <Sparkles className="w-4 h-4" />
                          Required Technical Skills for this Job
                        </label>
                        <span className="text-xs text-muted-foreground">Select from platform tags or type custom</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <Input
                          placeholder="Type a skill (e.g. Docker, LangChain, Flutter) & press Add..."
                          value={customSkillInput}
                          onChange={(e) => setCustomSkillInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddCustomSkill();
                            }
                          }}
                          className="h-9 text-xs"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleAddCustomSkill}
                          className="text-xs h-9 px-3"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add
                        </Button>
                      </div>

                      {/* Selected Skills Chips */}
                      {jobForm.skills && (
                        <div className="pt-1">
                          <span className="text-[11px] font-medium text-foreground block mb-1.5">Selected Skills:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {jobForm.skills
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .map((skill) => (
                                <Badge
                                  key={skill}
                                  variant="default"
                                  className="text-xs px-2.5 py-1 bg-primary text-primary-foreground flex items-center gap-1.5 cursor-pointer hover:bg-destructive/80 transition-colors"
                                  onClick={() => toggleSkill(skill)}
                                  title="Click to remove"
                                >
                                  <span>{skill}</span>
                                  <span className="text-xs font-bold leading-none">×</span>
                                </Badge>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Popular Platform Skills Selector */}
                      <div className="pt-2 border-t border-white/5">
                        <span className="text-[11px] font-medium text-muted-foreground block mb-2">
                          Popular Platform Skills (Click to add/remove):
                        </span>
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {availablePlatformSkills.map((skill) => {
                            const isSelected = jobForm.skills
                              ? jobForm.skills
                                  .split(",")
                                  .map((s) => s.trim().toLowerCase())
                                  .includes(skill.toLowerCase())
                              : false;
                            return (
                              <button
                                key={skill}
                                type="button"
                                onClick={() => toggleSkill(skill)}
                                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground border-primary font-medium shadow-sm"
                                    : "bg-card/60 hover:bg-white/10 text-muted-foreground hover:text-foreground border-white/10"
                                }`}
                              >
                                {isSelected ? "✓ " : "+ "}{skill}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Process of Recruiting */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium block">Process of Recruiting</label>
                        <span className="text-xs text-muted-foreground">Interview rounds, screening stages & timeline</span>
                      </div>
                      <Textarea
                        rows={3}
                        placeholder="e.g. Round 1: ATS Screening & Resume Evaluation&#10;Round 2: 45-min Technical Assessment & Coding Exercise&#10;Round 3: System Architecture & Engineering Deep Dive&#10;Round 4: Cultural Alignment & Leadership Interview&#10;Round 5: Official Offer Letter & Onboarding"
                        value={jobForm.recruiting_process}
                        onChange={(e) => setJobForm({ ...jobForm, recruiting_process: e.target.value })}
                      />
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-muted-foreground">Quick Templates:</span>
                        {[
                          "1. Screening Call → 2. Technical Challenge → 3. Final Offer",
                          "1. Resume Shortlist → 2. Live Coding (1h) → 3. Cultural Fit",
                          "1. Screening (30m) → 2. System Design → 3. Executive Round",
                        ].map((tmpl, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setJobForm({ ...jobForm, recruiting_process: tmpl })}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground border border-white/10 transition-colors"
                          >
                            + {tmpl.slice(0, 30)}...
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-4 flex items-center justify-end gap-4 border-t border-white/10">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setJobForm({
                            ...jobForm,
                            title: "",
                            description: "",
                            requirements: "",
                            recruiting_process: "",
                          });
                        }}
                      >
                        Clear
                      </Button>
                      <Button
                        type="submit"
                        variant="hero"
                        size="lg"
                        disabled={isSubmitting}
                        className="gap-2"
                      >
                        {isSubmitting ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Publish Job Vacancy</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </form>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: TRACKING SECTION                                            */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "tracking" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Header + Subtab navigation */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Recruiter Tracking Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                  Monitor all posted jobs, applicant volume, and inspect candidate CVs and resumes.
                </p>
              </div>

              <div className="flex items-center gap-2 p-1 bg-muted/40 rounded-xl border border-white/5">
                <button
                  onClick={() => setTrackingSubTab("jobs")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    trackingSubTab === "jobs"
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Jobs Posted ({jobsList.length})
                </button>
                <button
                  onClick={() => setTrackingSubTab("applications")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    trackingSubTab === "applications"
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Candidate Applications ({applicationsList.length})
                </button>
              </div>
            </div>

            {/* Quick Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card variant="glass">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Jobs Posted</p>
                    <p className="text-3xl font-bold font-display mt-1">{jobsList.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Briefcase className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Applicants</p>
                    <p className="text-3xl font-bold font-display mt-1">{applicationsList.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <Users className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Pending Review</p>
                    <p className="text-3xl font-bold font-display mt-1">
                      {applicationsList.filter(a => a.status === "pending").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                    <Clock className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Shortlisted / Hired</p>
                    <p className="text-3xl font-bold font-display mt-1">
                      {applicationsList.filter(a => a.status === "shortlisted" || a.status === "hired").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <UserCheck className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* SubTab 1: Posted Jobs List */}
            {trackingSubTab === "jobs" && (
              <div className="space-y-4">
                {jobsList.length === 0 ? (
                  <Card variant="glass" className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                      <Briefcase className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Jobs Posted Yet</h3>
                    <p className="text-muted-foreground max-w-md mx-auto mb-6">
                      Use the Post section to create your first vacancy listing and start collecting candidate CVs.
                    </p>
                    <Button variant="hero" onClick={() => setActiveTab("post")}>
                      <Plus className="w-4 h-4 mr-2" />
                      Post a Job Now
                    </Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {jobsList.map((job) => (
                      <Card key={job.id} variant="glass" className="hover:border-primary/40 transition-all">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={job.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                                alt={job.company_name}
                                className="w-10 h-10 rounded-xl object-cover bg-muted border border-white/10"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                                }}
                              />
                              <div>
                                <CardTitle className="text-base font-semibold">{job.title}</CardTitle>
                                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span>{job.company_name}</span>
                                  {job.organization_symbol && (
                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                                      {job.organization_symbol}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                job.status === "approved" || job.status === "active"
                                  ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                  : job.status === "rejected"
                                  ? "border-destructive/40 text-destructive bg-destructive/10"
                                  : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                              }`}
                            >
                              {job.status.replace("_", " ").toUpperCase()}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <DollarSign className="w-3.5 h-3.5 text-primary" />
                              <span className="truncate">{job.salary_description}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Users className="w-3.5 h-3.5 text-primary" />
                              <span>{job.vacancies} Vacanc{job.vacancies > 1 ? "ies" : "y"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5 text-primary" />
                              <span className="truncate">{job.location}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5 text-primary" />
                              <span>{job.job_type}</span>
                            </div>
                          </div>

                          {/* Indian Standard Time Application Window */}
                          <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 text-[11px] space-y-1">
                            <div className="flex justify-between text-muted-foreground">
                              <span>Window Start (IST):</span>
                              <span className="font-mono text-foreground">{job.start_date_pt?.replace("T", " ")}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Window End (IST):</span>
                              <span className="font-mono text-foreground">{job.final_date_pt?.replace("T", " ")}</span>
                            </div>
                          </div>

                          {job.skills && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {job.skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6).map((skill) => (
                                <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {skill}
                                </Badge>
                              ))}
                              {job.skills.split(",").map((s) => s.trim()).filter(Boolean).length > 6 && (
                                <span className="text-[10px] text-muted-foreground self-center">
                                  +{job.skills.split(",").map((s) => s.trim()).filter(Boolean).length - 6} more
                                </span>
                              )}
                            </div>
                          )}

                          {job.recruiting_process && (
                            <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-[11px] space-y-0.5">
                              <span className="font-semibold text-primary block">Process of Recruiting:</span>
                              <p className="text-muted-foreground line-clamp-2">{job.recruiting_process}</p>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-white/5">
                            <span className="text-xs font-medium text-primary">
                              {job.applications_count || 0} Candidate Application{(job.applications_count || 0) === 1 ? "" : "s"}
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="text-xs h-8 text-primary hover:text-primary/80"
                                title="View on Candidate Job Board"
                              >
                                <Link to="/candidate/jobs" target="_blank">
                                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                                  Live Board
                                </Link>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteJob(job.id, job.title)}
                                className="text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Delete
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setTrackingSubTab("applications");
                                }}
                                className="text-xs h-8"
                              >
                                View Applicants
                                <ChevronRight className="w-3.5 h-3.5 ml-1" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SubTab 2: Candidate Applications Tracking */}
            {trackingSubTab === "applications" && (
              <div className="space-y-4">
                {/* Filter bar */}
                <div className="flex items-center justify-between gap-4 p-3 bg-muted/20 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Filter Status:</span>
                    {["all", "pending", "reviewing", "shortlisted", "interview", "hired", "rejected"].map((st) => (
                      <button
                        key={st}
                        onClick={() => setCandidateFilter(st)}
                        className={`text-xs px-2.5 py-1 rounded-md transition-all capitalize ${
                          candidateFilter === st
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:bg-white/5"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Showing {filteredApps.length} applicants
                  </span>
                </div>

                {filteredApps.length === 0 ? (
                  <Card variant="glass" className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                      <Users className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Candidates Found</h3>
                    <p className="text-muted-foreground max-w-md mx-auto mb-4">
                      Candidates applying through the Candidate Job Board will appear here with instant resume and CV access.
                    </p>
                    <Button variant="outline" asChild>
                      <Link to="/candidate/jobs" target="_blank">
                        Open Candidate Job Page
                      </Link>
                    </Button>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filteredApps.map((app) => (
                      <Card
                        key={app.id}
                        variant="glass"
                        className="hover:border-primary/40 transition-all cursor-pointer"
                        onClick={() => setSelectedCandidate(app)}
                      >
                        <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-blue-500/20 border border-primary/30 flex items-center justify-center font-bold text-lg text-primary flex-shrink-0">
                              {app.candidate_name ? app.candidate_name[0].toUpperCase() : "C"}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-base">{app.candidate_name}</h3>
                                <Badge
                                  variant="outline"
                                  className={`text-xs capitalize ${
                                    app.status === "shortlisted" || app.status === "hired"
                                      ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                      : app.status === "interview"
                                      ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                                      : app.status === "rejected"
                                      ? "border-destructive/40 text-destructive bg-destructive/10"
                                      : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                                  }`}
                                >
                                  {app.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Applied for: <span className="text-foreground font-medium">{app.job_title || "Job Posting"}</span>
                                {app.company_name && ` at ${app.company_name}`}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                                <span>{app.candidate_email}</span>
                                {app.candidate_phone && <span>{app.candidate_phone}</span>}
                                {app.created_at && (
                                  <span>{new Date(app.created_at).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Quick action buttons for Recruiter */}
                          <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                            {(app.resume_url || app.cv_url) && (
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="text-xs h-8 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                              >
                                <a href={getAuthenticatedFileUrl(app.resume_url || app.cv_url)} target="_blank" rel="noopener noreferrer">
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>View Resume / CV</span>
                                </a>
                              </Button>
                            )}

                            <Button
                              variant="hero"
                              size="sm"
                              onClick={() => handleInspectCandidate(app)}
                              className="text-xs h-8"
                            >
                              Inspect Details
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 4: PROFILE & SETTINGS SECTION                                   */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "settings" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-8 max-w-4xl"
          >
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Recruiter Profile & Settings
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Manage your recruiter organization profile, User ID, and change your account password.
              </p>
            </div>

            {/* Profile Overview Card with Photo, Names, Mobile, Email, Education, Qualification, Job Role */}
            <Card variant="glass" className="border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    Verified Recruiter Profile
                  </CardTitle>
                  <CardDescription>
                    Your corporate identity, official Recruiter ID, and authorized organization details.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleOpenEditProfile}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-md shadow-primary/25 shrink-0"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit Profile</span>
                </Button>
              </CardHeader>

              <CardContent className="pt-6 space-y-6">
                {/* 1. Photo Section */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="relative">
                    <img
                      src={currentUser?.avatar_url || currentUser?.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                      alt={currentUser?.full_name || "Recruiter"}
                      className="w-24 h-24 rounded-2xl object-cover border-2 border-primary/40 shadow-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                      }}
                    />
                    <button
                      onClick={handleOpenEditProfile}
                      className="absolute -bottom-2 -right-2 p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                      title="Edit Photo"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-center sm:text-left space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <h3 className="text-xl font-bold text-foreground">
                        {currentUser?.full_name || "Recruiter"}
                      </h3>
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">
                        Authorized & Active
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-primary">
                      {currentUser?.job_role || "Senior Technical Recruiter"}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{currentUser?.company_name || jobForm.company_name || "Enterprise"}</span>
                      &bull;
                      <MapPin className="w-3.5 h-3.5 ml-1" />
                      <span>{currentUser?.location || "Remote / Office"}</span>
                    </p>
                  </div>
                </div>

                {/* 2. Names, Mobile, Email, Education, Qualification, Job Role */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                      <User className="w-3 h-3 text-primary" />
                      Recruiter Full Name
                    </span>
                    <span className="text-sm font-bold text-foreground block">
                      {currentUser?.full_name || "Recruiter"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-400" />
                      Mobile Number
                    </span>
                    <span className="text-sm font-semibold text-foreground font-mono block">
                      {currentUser?.phone || "+1 (555) 019-2834"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                      <Mail className="w-3 h-3 text-primary" />
                      Email Address
                    </span>
                    <span className="text-sm font-medium text-foreground truncate block">
                      {currentUser?.email || "recruiter@organization.com"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                    <span className="text-purple-300 block uppercase font-mono text-[10px] flex items-center gap-1">
                      <GraduationCap className="w-3 h-3" />
                      Education (Degree & University)
                    </span>
                    <span className="text-sm font-semibold text-foreground block">
                      {currentUser?.education || "Bachelor of Business / HR Management"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                    <span className="text-purple-300 block uppercase font-mono text-[10px] flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      Education Qualification
                    </span>
                    <span className="text-sm font-semibold text-foreground block">
                      {currentUser?.qualification || "MBA / Certified Talent Specialist"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                      <Briefcase className="w-3 h-3 text-blue-400" />
                      Designation / Job Role
                    </span>
                    <span className="text-sm font-bold text-primary block">
                      {currentUser?.job_role || "Senior Technical Recruiter"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px]">Official Recruiter ID</span>
                    <span className="text-sm font-bold text-primary font-mono block">
                      {currentUser?.custom_user_id || "REC-1001"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px]">Company / Organization</span>
                    <span className="text-sm font-bold text-foreground block">
                      {currentUser?.company_name || jobForm.company_name || "Enterprise"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px]">Location</span>
                    <span className="text-sm font-medium text-foreground block">
                      {currentUser?.location || "Remote / Corporate Office"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Change Password Form Card */}
            <Card variant="glass" className="border-white/10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="w-5 h-5 text-primary" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your recruiter login password. Enter your current password followed by your new password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRecruiterChangePassword} className="space-y-4 max-w-lg">
                  {/* Field 1: Old Password */}
                  <div>
                    <Label className="text-xs font-semibold uppercase text-muted-foreground block mb-1">
                      Old Password *
                    </Label>
                    <Input
                      type="password"
                      placeholder="Enter current password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      required
                      className="bg-black/30 border-white/15"
                    />
                  </div>

                  {/* Field 2: New Password */}
                  <div>
                    <Label className="text-xs font-semibold uppercase text-muted-foreground block mb-1">
                      New Password *
                    </Label>
                    <Input
                      type="password"
                      placeholder="Enter new secure password (min. 6 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="bg-black/30 border-white/15"
                    />
                  </div>

                  {/* Field 3: Confirm New Password */}
                  <div>
                    <Label className="text-xs font-semibold uppercase text-muted-foreground block mb-1">
                      Confirm New Password *
                    </Label>
                    <Input
                      type="password"
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="bg-black/30 border-white/15"
                    />
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={changingPassword}
                      variant="hero"
                      className="gap-2 shadow-lg shadow-primary/25"
                    >
                      {changingPassword ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>Change Password</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>

      {/* Candidate Details & Resume Modal */}
      <Dialog open={!!selectedCandidate} onOpenChange={() => setSelectedCandidate(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 text-foreground shadow-2xl p-6">
          {selectedCandidate && (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex items-center justify-between gap-4">
                  <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                    <UserCheck className="w-6 h-6 text-primary" />
                    {selectedCandidate.candidate_name}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="capitalize text-xs font-semibold px-2.5 py-1"
                  >
                    Status: {selectedCandidate.status}
                  </Badge>
                </div>
                <DialogDescription>
                  Applied for <strong>{selectedCandidate.job_title}</strong> at {selectedCandidate.company_name}
                </DialogDescription>
              </DialogHeader>

              {/* Contact Information */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-white/5 border border-white/10 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Email Address</span>
                  <a href={`mailto:${selectedCandidate.candidate_email}`} className="text-primary hover:underline font-medium">
                    {selectedCandidate.candidate_email}
                  </a>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Phone Number</span>
                  <span className="font-medium">{selectedCandidate.candidate_phone || "Not provided"}</span>
                </div>
                {selectedCandidate.profile_url && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Profile URL</span>
                    <a href={selectedCandidate.profile_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block">
                      {selectedCandidate.profile_url}
                    </a>
                  </div>
                )}
                {selectedCandidate.portfolio_url && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Portfolio / GitHub</span>
                    <a href={selectedCandidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block">
                      {selectedCandidate.portfolio_url}
                    </a>
                  </div>
                )}
              </div>

              {/* Candidate Uploaded Files (Resume & CV) */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Uploaded Documents (Resume & CV)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center font-bold text-xs">
                        PDF
                      </div>
                      <div>
                        <p className="text-xs font-medium truncate max-w-[150px]">
                          {selectedCandidate.resume_filename || "Candidate_Resume.pdf"}
                        </p>
                        <span className="text-[10px] text-muted-foreground">Candidate Resume</span>
                      </div>
                    </div>
                    {(selectedCandidate.resume_url || selectedCandidate.cv_url) && (
                      <Button variant="outline" size="sm" asChild className="h-8 text-xs">
                        <a href={getAuthenticatedFileUrl(selectedCandidate.resume_url || selectedCandidate.cv_url)} target="_blank" rel="noopener noreferrer">
                          <Eye className="w-3 h-3 mr-1" />
                          View Document
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-medium truncate max-w-[150px]">
                          AI Resume Extraction
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          {parsingInspectResume ? "Analyzing resume..." : parsedCandidateResume ? "Extracted successfully" : "Available to analyze"}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="hero"
                      size="sm"
                      onClick={() => handleInspectCandidate(selectedCandidate)}
                      disabled={parsingInspectResume}
                      className="h-8 text-xs gap-1"
                    >
                      {parsingInspectResume ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Parsing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3" />
                          {parsedCandidateResume ? "Re-analyze" : "Analyze Resume"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Structured Resume Parser Details Display */}
                {parsedCandidateResume && (
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3 mt-3">
                    <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-xs font-semibold text-foreground">Extracted Resume Profile</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                        {(parsedCandidateResume.skills || []).length} Skills Extracted
                      </Badge>
                    </div>

                    {/* Extracted Contact / Basics */}
                    {parsedCandidateResume.contact && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {parsedCandidateResume.contact.name && (
                          <div>
                            <span className="text-muted-foreground block text-[10px]">Extracted Name:</span>
                            <span className="font-medium text-foreground">{parsedCandidateResume.contact.name}</span>
                          </div>
                        )}
                        {parsedCandidateResume.contact.email && (
                          <div>
                            <span className="text-muted-foreground block text-[10px]">Extracted Email:</span>
                            <span className="font-medium text-foreground">{parsedCandidateResume.contact.email}</span>
                          </div>
                        )}
                        {parsedCandidateResume.contact.phone && (
                          <div>
                            <span className="text-muted-foreground block text-[10px]">Extracted Phone:</span>
                            <span className="font-medium text-foreground">{parsedCandidateResume.contact.phone}</span>
                          </div>
                        )}
                        {parsedCandidateResume.contact.location && (
                          <div>
                            <span className="text-muted-foreground block text-[10px]">Location:</span>
                            <span className="font-medium text-foreground">{parsedCandidateResume.contact.location}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Extracted Skills Badges */}
                    {parsedCandidateResume.skills && parsedCandidateResume.skills.length > 0 && (
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-mono mb-1.5">
                          Extracted Candidate Skills
                        </span>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pt-0.5">
                          {parsedCandidateResume.skills.map((skill: string, idx: number) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="text-[11px] bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                            >
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Extracted Summary */}
                    {parsedCandidateResume.summary && (
                      <div className="pt-2 border-t border-primary/10">
                        <span className="text-[10px] text-muted-foreground block uppercase font-mono mb-1">
                          Professional Summary
                        </span>
                        <p className="text-xs text-foreground/90 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-white/5">
                          {parsedCandidateResume.summary}
                        </p>
                      </div>
                    )}

                    {/* Extracted Experience */}
                    {parsedCandidateResume.experience && parsedCandidateResume.experience.length > 0 && (
                      <div className="pt-2 border-t border-primary/10 space-y-1.5">
                        <span className="text-[10px] text-muted-foreground block uppercase font-mono">
                          Work Experience
                        </span>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {Array.isArray(parsedCandidateResume.experience) ? (
                            parsedCandidateResume.experience.map((exp: any, i: number) => (
                              <div key={i} className="p-2 rounded bg-black/20 border border-white/5 text-xs">
                                <div className="font-semibold text-foreground flex justify-between">
                                  <span>{typeof exp === "string" ? exp : (exp.title || exp.role || "Role")}</span>
                                  {exp.duration && <span className="text-[10px] text-muted-foreground">{exp.duration}</span>}
                                </div>
                                {exp.company && <div className="text-[11px] text-primary/80">{exp.company}</div>}
                                {Array.isArray(exp.highlights) && exp.highlights.length > 0 && (
                                  <ul className="list-disc list-inside mt-1 text-[11px] text-muted-foreground space-y-0.5">
                                    {exp.highlights.map((h: string, hi: number) => (
                                      <li key={hi} className="truncate">{h}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground">{String(parsedCandidateResume.experience)}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Extracted Education */}
                    {parsedCandidateResume.education && parsedCandidateResume.education.length > 0 && (
                      <div className="pt-2 border-t border-primary/10 space-y-1.5">
                        <span className="text-[10px] text-muted-foreground block uppercase font-mono">
                          Education
                        </span>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                          {Array.isArray(parsedCandidateResume.education) ? (
                            parsedCandidateResume.education.map((edu: any, i: number) => (
                              <div key={i} className="p-2 rounded bg-black/20 border border-white/5 text-xs flex justify-between items-center">
                                <div>
                                  <div className="font-medium text-foreground">{typeof edu === "string" ? edu : (edu.degree || "Degree")}</div>
                                  {edu.institution && <div className="text-[11px] text-muted-foreground">{edu.institution}</div>}
                                </div>
                                {edu.year && <span className="text-[10px] text-primary">{edu.year}</span>}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground">{String(parsedCandidateResume.education)}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cover Letter */}
              {selectedCandidate.cover_letter && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Cover Letter</h4>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {selectedCandidate.cover_letter}
                  </div>
                </div>
              )}

              {/* Scheduled Interview Details Card */}
              {(selectedCandidate.interview_meeting_link || selectedCandidate.interview_scheduled_at || selectedCandidate.status === "interview") && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 via-primary/5 to-purple-500/10 border border-blue-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-foreground block">
                          {selectedCandidate.interview_round || "Scheduled Interview"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {selectedCandidate.interview_scheduled_at
                            ? new Date(selectedCandidate.interview_scheduled_at).toLocaleString('en-US', {
                                weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              })
                            : "Interview date/time pending"}
                        </span>
                      </div>
                    </div>
                    <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/40 text-[10px]">
                      Interview Active
                    </Badge>
                  </div>

                  {selectedCandidate.interview_meeting_link && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-black/40 border border-white/5 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <Link2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <span className="text-muted-foreground truncate font-mono text-[11px]">
                          {selectedCandidate.interview_meeting_link}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedCandidate.interview_meeting_link || "");
                            toast({ title: "Link Copied! 📋", description: "Meeting URL copied to clipboard" });
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="hero"
                          asChild
                          className="h-7 px-3 text-xs gap-1"
                        >
                          <a href={selectedCandidate.interview_meeting_link} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3" />
                            Join Call
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}

                  {selectedCandidate.interview_notes && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Notes for Candidate: {selectedCandidate.interview_notes}
                    </p>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenScheduleModal(selectedCandidate)}
                    className="text-xs h-7 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 gap-1.5"
                  >
                    <Calendar className="w-3 h-3" />
                    Reschedule / Edit Meeting Details
                  </Button>
                </div>
              )}

              {/* Recruiter Action Bar: Update Status */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Update Applicant Status:</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateAppStatus(selectedCandidate.id, "reviewing")}
                    className="text-xs h-8"
                  >
                    Reviewing
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenScheduleModal(selectedCandidate)}
                    className="text-xs h-8 text-blue-400 border-blue-500/30 hover:bg-blue-500/10 gap-1"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Interview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateAppStatus(selectedCandidate.id, "shortlisted")}
                    className="text-xs h-8 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                  >
                    Shortlist
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateAppStatus(selectedCandidate.id, "rejected")}
                    className="text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Recruiter Profile Edit Modal (Centered on Screen) */}
      <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-xl border-white/10 text-foreground shadow-2xl p-6">
          <DialogHeader className="pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Edit Recruiter Profile</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Update your official recruiter credentials, organizational identity, and contact details.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveRecruiterProfile} className="space-y-5 pt-2">
            {/* Avatar & Photo Section */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-primary" />
                Profile Photo *
              </Label>
              <div className="flex items-center gap-4">
                <img
                  src={recruiterProfileForm.avatar_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                  alt="Avatar Preview"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-primary/30 shadow-md bg-muted flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                  }}
                />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Upload Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              toast({
                                title: "File Too Large",
                                description: "Please choose an image file under 5MB.",
                                variant: "destructive",
                              });
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const base64 = event.target?.result as string;
                              if (base64) {
                                setRecruiterProfileForm((prev) => ({ ...prev, avatar_url: base64 }));
                                toast({
                                  title: "Photo Selected",
                                  description: "Your profile photo is ready to save.",
                                });
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                    {recruiterProfileForm.avatar_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRecruiterProfileForm((prev) => ({ ...prev, avatar_url: "" }))}
                        className="text-xs text-muted-foreground hover:text-destructive h-7"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Upload official recruiter picture from device (JPG/PNG/WebP under 5MB).
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-primary" />
                  Full Name *
                </Label>
                <Input
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={recruiterProfileForm.full_name}
                  onChange={(e) => setRecruiterProfileForm({ ...recruiterProfileForm, full_name: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
              </div>

              {/* Mobile Phone Number */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    Mobile Number *
                  </span>
                  <span className="text-[10px] text-primary font-normal">All country formats allowed</span>
                </Label>
                <Input
                  required
                  placeholder="e.g. +91 98765 43210, +1 (555) 234-5678, +44 7911 123456"
                  value={recruiterProfileForm.phone}
                  onChange={(e) => setRecruiterProfileForm({ ...recruiterProfileForm, phone: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
                <p className="text-[10px] text-muted-foreground">
                  Accepts any international mobile number with country code (+91, +1, +44, +61, +971, etc.)
                </p>
              </div>

              {/* Job Role / Designation */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                  Job Role / Designation *
                </Label>
                <Input
                  required
                  placeholder="e.g. Lead Talent Acquisition Partner"
                  value={recruiterProfileForm.job_role}
                  onChange={(e) => setRecruiterProfileForm({ ...recruiterProfileForm, job_role: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
              </div>

              {/* Company / Organization Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  Company / Organization *
                </Label>
                <Input
                  required
                  placeholder="e.g. TechCorp Global"
                  value={recruiterProfileForm.company_name}
                  onChange={(e) => setRecruiterProfileForm({ ...recruiterProfileForm, company_name: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
              </div>

              {/* Education / College / University */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
                  Education (College / University) *
                </Label>
                <Input
                  required
                  placeholder="e.g. Stanford University / MIT"
                  value={recruiterProfileForm.education}
                  onChange={(e) => setRecruiterProfileForm({ ...recruiterProfileForm, education: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
              </div>

              {/* Education Qualification */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-purple-400" />
                  Qualification / Degree *
                </Label>
                <Input
                  required
                  placeholder="e.g. MBA in Human Resources, B.Tech CS"
                  value={recruiterProfileForm.qualification}
                  onChange={(e) => setRecruiterProfileForm({ ...recruiterProfileForm, qualification: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
              </div>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                Work Location / Timezone
              </Label>
              <Input
                placeholder="e.g. San Francisco, CA (Pacific Time)"
                value={recruiterProfileForm.location}
                onChange={(e) => setRecruiterProfileForm({ ...recruiterProfileForm, location: e.target.value })}
                className="bg-black/30 border-white/10"
              />
            </div>

            {/* Editable Official Email Address with Warning Banner */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-primary" />
                  Official Corporate Email Address *
                </span>
                <span className="text-[10px] text-primary font-normal">Official Work Domain Only</span>
              </Label>
              <Input
                type="email"
                required
                placeholder="e.g. recruiter@company.com, talent@organization.org"
                value={recruiterProfileForm.email}
                onChange={(e) => setRecruiterProfileForm({ ...recruiterProfileForm, email: e.target.value })}
                className={`bg-black/30 ${
                  isPersonalEmail(recruiterProfileForm.email) ? "border-amber-500/50 text-amber-300" : "border-white/10"
                }`}
              />
              {isPersonalEmail(recruiterProfileForm.email) ? (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Official Corporate Email Required</span>
                    <span>Personal email domains (gmail, yahoo, outlook, etc.) are strictly prohibited. Please provide your official company or institutional email.</span>
                  </div>
                </div>
              ) : recruiterProfileForm.email.trim().toLowerCase() !== (currentUser?.email || "").trim().toLowerCase() ? (
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>Official Corporate Email Change &bull; Verification code will be sent on save</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isRequestingOtp}
                    onClick={() => handleInitiateEmailVerification(recruiterProfileForm.email)}
                    className="h-6 text-[10px] px-2 bg-primary/20 hover:bg-primary/30 text-primary-foreground"
                  >
                    {isRequestingOtp ? "Sending..." : "Verify Now"}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>Used for candidate communications and job postings</span>
                  <span className="font-mono text-primary">ID: {currentUser?.custom_user_id || "REC-USER"}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditProfileOpen(false)}
                className="border-white/10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingProfile || isRequestingOtp}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/25 min-w-[130px]"
              >
                {savingProfile || isRequestingOtp ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Recruiter Official Email Verification Modal */}
      <Dialog open={isVerifyEmailOpen} onOpenChange={setIsVerifyEmailOpen}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-primary/30 text-foreground shadow-2xl p-6">
          <DialogHeader className="space-y-2 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto mb-1">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">
              Verify Official Recruiter Email
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              We have dispatched a 6-digit verification code to <strong className="text-foreground">{pendingEmailToVerify}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmEmailVerification} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground text-center block">
                Enter 6-Digit Verification Code
              </Label>
              <Input
                type="text"
                maxLength={6}
                autoFocus
                required
                placeholder="123456"
                value={verificationOtpCode}
                onChange={(e) => setVerificationOtpCode(e.target.value.replace(/\D/g, ""))}
                className="bg-black/40 border-primary/40 text-center font-mono text-2xl tracking-[8px] font-bold py-6 text-primary"
              />
              <p className="text-[11px] text-muted-foreground text-center">
                Code expires in 15 minutes. Check your corporate inbox or spam folder.
              </p>
            </div>

            <div className="pt-1 flex items-center justify-between text-xs">
              <button
                type="button"
                disabled={isRequestingOtp}
                onClick={() => handleInitiateEmailVerification(pendingEmailToVerify)}
                className="text-primary hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
              >
                {isRequestingOtp ? "Sending..." : "Resend Code"}
              </button>
              <span className="text-muted-foreground text-[11px]">Corporate Security Verification</span>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsVerifyEmailOpen(false)}
                className="border-white/10 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isVerifyingOtp || verificationOtpCode.length < 6}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 text-xs shadow-lg shadow-primary/25"
              >
                {isVerifyingOtp ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Verify & Confirm Email</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Recruiter Interview Scheduling Modal (Centered on Screen) */}
      <Dialog open={isScheduleModalOpen} onOpenChange={setIsScheduleModalOpen}>
        <DialogContent className="max-w-lg bg-card/95 backdrop-blur-xl border-blue-500/20 text-foreground shadow-2xl p-6">
          <DialogHeader className="pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Schedule Candidate Interview</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Set the interview date, round, and Google Meet or corporate meeting link for {scheduleCandidate?.candidate_name}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleConfirmScheduleInterview} className="space-y-4 pt-2">
            {scheduleCandidate && (
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold text-foreground block">{scheduleCandidate.candidate_name}</span>
                  <span className="text-muted-foreground">{scheduleCandidate.candidate_email}</span>
                </div>
                <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-[10px]">
                  {scheduleCandidate.job_title || "Position"}
                </Badge>
              </div>
            )}

            {/* Round Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Interview Stage / Round Name *</Label>
              <Input
                required
                placeholder="e.g. Technical Assessment - Round 1"
                value={interviewForm.round}
                onChange={(e) => setInterviewForm({ ...interviewForm, round: e.target.value })}
                className="bg-black/30 border-white/10"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  "Initial Recruiter Screen",
                  "Technical Interview Round 1",
                  "System Design / Coding Round",
                  "Hiring Manager Interview",
                  "Final Culture & HR Round",
                ].map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => setInterviewForm({ ...interviewForm, round: preset })}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-blue-500/20 hover:text-blue-300 transition-colors border border-white/10"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Scheduled Date and Time */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Scheduled Date & Time *
              </Label>
              <Input
                type="datetime-local"
                required
                value={interviewForm.scheduled_at}
                onChange={(e) => setInterviewForm({ ...interviewForm, scheduled_at: e.target.value })}
                className="bg-black/30 border-white/10 font-mono text-xs"
              />
            </div>

            {/* Google Meet / Video Link */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                  Google Meet / Video Meeting Link *
                </Label>
                <button
                  type="button"
                  onClick={() => setInterviewForm({ ...interviewForm, meeting_link: `https://meet.google.com/new` })}
                  className="text-[10px] text-blue-400 hover:underline"
                >
                  Create Google Meet
                </button>
              </div>
              <Input
                type="url"
                required
                placeholder="https://meet.google.com/xxx-xxxx-xxx or company link"
                value={interviewForm.meeting_link}
                onChange={(e) => setInterviewForm({ ...interviewForm, meeting_link: e.target.value })}
                className="bg-black/30 border-white/10 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                This link will be directly clickable as "Join Google Meet" in the client's application section.
              </p>
            </div>

            {/* Notes for Candidate */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Interview Notes / Instructions for Candidate</Label>
              <Textarea
                rows={2}
                placeholder="e.g. Please join 5 mins before scheduled time with webcam ready."
                value={interviewForm.notes}
                onChange={(e) => setInterviewForm({ ...interviewForm, notes: e.target.value })}
                className="bg-black/30 border-white/10 text-xs"
              />
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-xs border-white/10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={schedulingApp}
                className="bg-blue-600 hover:bg-blue-500 text-white gap-2 text-xs shadow-lg shadow-blue-600/30"
              >
                {schedulingApp ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Scheduling...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5" />
                    <span>Confirm & Schedule Interview</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
