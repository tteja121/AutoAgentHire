import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, Building2,
  DollarSign, Users, Calendar, MapPin, LogOut, Filter, UserCheck,
  UserX, Mail, Sparkles, Briefcase, ChevronRight, AlertCircle, FileCheck,
  LayoutDashboard, TrendingUp, ShieldAlert, Award, UserPlus, Key, Settings, Lock,
  Camera, User, Phone, GraduationCap, Edit3, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { calculateRecruiterId } from "@/utils/recruiterId";
import { authService } from "@/services/authService";

export const PERSONAL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com",
  "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "zoho.com", "proton.me", "protonmail.com", "mail.com", "gmx.com",
  "yandex.com", "mail.ru", "inbox.com"
];

export const isPersonalEmail = (email: string) => {
  if (!email || !email.includes("@")) return false;
  const domain = email.split("@").pop()?.trim().toLowerCase() || "";
  return PERSONAL_DOMAINS.includes(domain);
};

interface RecruiterRequest {
  id: number;
  uuid: string;
  email: string;
  custom_user_id?: string;
  full_name?: string;
  company_name?: string;
  company_logo_url?: string;
  role: string;
  approval_status: string;
  approval_notes?: string;
  created_at?: string;
}

interface JobPosting {
  id: number;
  uuid: string;
  recruiter_name?: string;
  company_name: string;
  company_logo_url?: string;
  organization_symbol?: string;
  title: string;
  vacancies: number;
  salary_description: string;
  job_type: string;
  location: string;
  description: string;
  requirements?: string;
  recruiting_process?: string;
  start_date_pt: string;
  final_date_pt: string;
  timezone: string;
  status: string;
  authorizer_notes?: string;
  created_at?: string;
}

interface UserRecord {
  id: number;
  uuid: string;
  email: string;
  custom_user_id?: string;
  full_name?: string;
  role: string;
  company_name?: string;
  is_active: boolean;
  approval_status?: string;
  created_at?: string;
  last_login?: string;
}

interface AuditLogRecord {
  id: number;
  action: string;
  performed_by_email?: string;
  target_type?: string;
  target_id?: string;
  details?: any;
  timestamp?: string;
}

export default function AuthorizerPortal() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // Four Primary Sections: 'dashboard' | 'access_requests' | 'user_tracking' | 'settings'
  const [activeTab, setActiveTab] = useState<"dashboard" | "access_requests" | "user_tracking" | "settings">("dashboard");

  // Settings & Password Change State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Authorizer Profile State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [authorizerProfileForm, setAuthorizerProfileForm] = useState({
    avatar_url: "",
    full_name: "",
    email: "",
    phone: "",
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

  // Create Recruiter Modal State (Feature 2: 8-character Recruiter ID formula)
  const [createRecruiterOpen, setCreateRecruiterOpen] = useState(false);
  const [creatingRecruiter, setCreatingRecruiter] = useState(false);
  const [newRecruiterForm, setNewRecruiterForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    date_of_birth: "",
    company_name: "",
  });
  const [generatedRecruiterId, setGeneratedRecruiterId] = useState("");
  const [recruiterIdError, setRecruiterIdError] = useState("");

  // Live Recruiter ID preview calculation whenever name or DOB changes
  useEffect(() => {
    if (!newRecruiterForm.first_name && !newRecruiterForm.last_name && !newRecruiterForm.date_of_birth) {
      setGeneratedRecruiterId("");
      setRecruiterIdError("");
      return;
    }
    const result = calculateRecruiterId(
      newRecruiterForm.first_name,
      newRecruiterForm.last_name,
      newRecruiterForm.date_of_birth
    );
    if (result.isValid) {
      setGeneratedRecruiterId(result.recruiterId);
      setRecruiterIdError("");
    } else {
      setGeneratedRecruiterId("");
      setRecruiterIdError(result.error || "Incomplete inputs for ID formula");
    }
  }, [newRecruiterForm.first_name, newRecruiterForm.last_name, newRecruiterForm.date_of_birth]);

  // Recruiter Requests State (Access Permission)
  const [recruiterRequests, setRecruiterRequests] = useState<RecruiterRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [recruiterFilter, setRecruiterFilter] = useState<string>("pending_approval");
  const [selectedRecruiter, setSelectedRecruiter] = useState<RecruiterRequest | null>(null);
  const [recruiterActionNotes, setRecruiterActionNotes] = useState("");
  const [recruiterActionLoading, setRecruiterActionLoading] = useState(false);

  // Job Postings State (Retained workflow integrated within tracking / review)
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobFilter, setJobFilter] = useState<string>("pending_approval");
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [jobAuthNotes, setJobAuthNotes] = useState("");
  const [jobActionLoading, setJobActionLoading] = useState(false);

  // User Tracking & Audit Logs State
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [userSearchTerm, setUserSearchTerm] = useState<string>("");
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [userTrackingSubTab, setUserTrackingSubTab] = useState<"users" | "jobs" | "audit" | "logins">("users");

  useEffect(() => {
    loadRecruiterRequests();
  }, [recruiterFilter]);

  useEffect(() => {
    loadJobs();
  }, [jobFilter]);

  useEffect(() => {
    loadUsers();
    loadAuditLogs();
  }, [userRoleFilter]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const resp = await apiClient.get(
        `${API_ENDPOINTS.recruiter.authorizerUsers}?role_filter=${userRoleFilter}${userSearchTerm ? `&search=${encodeURIComponent(userSearchTerm)}` : ""}`
      );
      setUsersList(resp.data || []);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        toast({
          title: "Session Expired",
          description: "Authorizer session has expired. Please sign in again.",
          variant: "destructive",
        });
        navigate("/login");
        return;
      }
      console.error("Failed to load users for authorizer:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const resp = await apiClient.get(API_ENDPOINTS.recruiter.authorizerAuditLogs);
      setAuditLogs(resp.data || []);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        navigate("/login");
        return;
      }
      console.error("Failed to load audit logs:", err);
    }
  };

  const loadRecruiterRequests = async () => {
    setLoadingRequests(true);
    try {
      const resp = await apiClient.get(
        `${API_ENDPOINTS.recruiter.authorizerRecruiterRequests}?status_filter=${recruiterFilter}`
      );
      setRecruiterRequests(resp.data || []);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        toast({
          title: "Session Expired",
          description: "Authorizer session has expired. Please sign in again.",
          variant: "destructive",
        });
        navigate("/login");
        return;
      }
      console.error("Failed to load recruiter requests:", err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadJobs = async () => {
    setLoadingJobs(true);
    try {
      const resp = await apiClient.get(
        `${API_ENDPOINTS.recruiter.authorizerPendingJobs}?status_filter=${jobFilter}`
      );
      setJobs(resp.data || []);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        navigate("/login");
        return;
      }
      console.error("Failed to load authorizer jobs:", err);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleRecruiterAction = async (
    userId: number,
    actionStatus: "approved" | "rejected",
    notes?: string
  ) => {
    setRecruiterActionLoading(true);
    try {
      await apiClient.post(API_ENDPOINTS.recruiter.authorizeRecruiterRequest(userId), {
        status: actionStatus,
        notes: notes ?? recruiterActionNotes,
      });

      toast({
        title: actionStatus === "approved" ? "Recruiter Approved!" : "Recruiter Request Rejected",
        description: actionStatus === "approved"
          ? "Recruiter has been granted permission to log in to the website."
          : "The recruiter registration request was rejected.",
      });

      setSelectedRecruiter(null);
      setRecruiterActionNotes("");
      loadRecruiterRequests();
    } catch (err: any) {
      toast({
        title: "Action failed",
        description: err?.message || "Could not process recruiter authorization action",
        variant: "destructive",
      });
    } finally {
      setRecruiterActionLoading(false);
    }
  };

  const handleJobAction = async (jobId: number, statusAction: "approved" | "rejected") => {
    setJobActionLoading(true);
    try {
      await apiClient.post(API_ENDPOINTS.recruiter.authorizeJob(jobId), {
        status: statusAction,
        notes: jobAuthNotes,
      });
      toast({
        title: `Job ${statusAction === "approved" ? "Approved" : "Rejected"}`,
        description: `The job posting has been successfully ${statusAction}.`,
      });
      setSelectedJob(null);
      setJobAuthNotes("");
      loadJobs();
    } catch (err: any) {
      toast({
        title: "Action failed",
        description: err?.message || "Could not process authorization action",
        variant: "destructive",
      });
    } finally {
      setJobActionLoading(false);
    }
  };

  const handleCreateRecruiter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newRecruiterForm.first_name.trim() ||
      !newRecruiterForm.last_name.trim() ||
      !newRecruiterForm.date_of_birth.trim() ||
      !newRecruiterForm.email.trim() ||
      !newRecruiterForm.password.trim() ||
      !newRecruiterForm.company_name.trim()
    ) {
      toast({
        title: "Required Fields Missing",
        description: "First Name, Last Name, Date of Birth (DD/MM/YYYY), Email, Password, and Company Name are all mandatory.",
        variant: "destructive",
      });
      return;
    }

    const calc = calculateRecruiterId(
      newRecruiterForm.first_name,
      newRecruiterForm.last_name,
      newRecruiterForm.date_of_birth
    );

    if (!calc.isValid || !calc.recruiterId) {
      toast({
        title: "Invalid Recruiter Details",
        description: calc.error || "Please verify First Name, Last Name, and Date of Birth (DD/MM/YYYY).",
        variant: "destructive",
      });
      return;
    }

    if (isPersonalEmail(newRecruiterForm.email)) {
      toast({
        title: "Official Email Required",
        description: "Recruiters must register with an official corporate email address. Personal email domains (gmail, yahoo, etc.) are strictly prohibited.",
        variant: "destructive",
      });
      return;
    }

    setCreatingRecruiter(true);
    try {
      const resp = await apiClient.post(API_ENDPOINTS.recruiter.authorizerCreateRecruiter, {
        first_name: newRecruiterForm.first_name.trim(),
        last_name: newRecruiterForm.last_name.trim(),
        date_of_birth: newRecruiterForm.date_of_birth.trim(),
        email: newRecruiterForm.email.trim(),
        password: newRecruiterForm.password,
        company_name: newRecruiterForm.company_name.trim(),
        custom_user_id: calc.recruiterId,
      });

      toast({
        title: "Recruiter Account Created & Authorized! ✨",
        description: `Official Recruiter ID: ${resp.data.custom_user_id} issued for ${resp.data.company_name}.`,
      });
      setCreateRecruiterOpen(false);
      setNewRecruiterForm({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        date_of_birth: "",
        company_name: "",
      });
      setGeneratedRecruiterId("");
      setRecruiterIdError("");
      loadRecruiterRequests();
      loadUsers();
    } catch (err: any) {
      if (err?.response?.status === 401) {
        toast({
          title: "Session Expired",
          description: "Your Authorizer session has expired. Please log in again.",
          variant: "destructive",
        });
        localStorage.removeItem("authToken");
        localStorage.removeItem("userRole");
        navigate("/login");
        return;
      }
      const detail = err?.response?.data?.detail || err?.message || "Failed to create recruiter account";
      toast({
        title: "Recruiter Creation Failed",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setCreatingRecruiter(false);
    }
  };

  const handleLogout = async () => {
    await authService.signOut();
    navigate("/login");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
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

  const loadAuthorizerProfile = async () => {
    try {
      const resp = await apiClient.get(API_ENDPOINTS.auth.me);
      if (resp.data) {
        setCurrentUser(resp.data);
      }
    } catch (err) {
      console.warn("Could not load authorizer profile:", err);
    }
  };

  useEffect(() => {
    loadAuthorizerProfile();
  }, []);

  const handleOpenEditProfile = () => {
    setAuthorizerProfileForm({
      avatar_url: currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop",
      full_name: currentUser?.full_name || "Official System Authorizer",
      email: currentUser?.email || "",
      phone: currentUser?.phone || "+1 (555) 019-9000",
      education: currentUser?.education || "Master of Science in Information Systems",
      qualification: currentUser?.qualification || "Chief Governance Officer / CISO Certified",
      job_role: currentUser?.job_role || "Principal Platform Authorizer & Governance Officer",
      company_name: currentUser?.company_name || "AutoHire Central Authority",
      location: currentUser?.location || "San Francisco, CA (Pacific Time)",
    });
    setIsEditProfileOpen(true);
  };

  const handleInitiateEmailVerification = async (targetEmail: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      toast({
        title: "Official Email Required",
        description: "Please enter your official email address.",
        variant: "destructive",
      });
      return false;
    }

    if (isPersonalEmail(cleanEmail)) {
      toast({
        title: "Official Work Email Required",
        description: "Personal email domains (gmail.com, yahoo.com, etc.) are strictly prohibited. Please provide an official corporate or work email address.",
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
        ...authorizerProfileForm,
        email: pendingEmailToVerify,
      };
      await apiClient.post(API_ENDPOINTS.settings.updateProfile, updatedProfilePayload);

      setCurrentUser((prev: any) => ({
        ...prev,
        ...updatedProfilePayload,
        email: verifyResp.data?.user?.email || pendingEmailToVerify,
      }));
      setAuthorizerProfileForm(updatedProfilePayload);

      setIsVerifyEmailOpen(false);
      setIsEditProfileOpen(false);
      setVerificationOtpCode("");
      setPendingEmailToVerify("");

      toast({
        title: "Official Email Verified & Saved! ✨",
        description: `Your official Authorizer email has been successfully updated to ${verifyResp.data?.user?.email || pendingEmailToVerify}.`,
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

  const handleSaveAuthorizerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = (authorizerProfileForm.email || "").trim().toLowerCase();
    if (!cleanEmail) {
      toast({
        title: "Official Email Required",
        description: "Authorizer account email address cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    if (isPersonalEmail(cleanEmail)) {
      toast({
        title: "Official Work Email Required",
        description: "Authorizer accounts must use an official corporate or work email address. Personal email domains (gmail.com, yahoo.com, etc.) are strictly prohibited.",
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
      const resp = await apiClient.post(API_ENDPOINTS.settings.updateProfile, authorizerProfileForm);
      setCurrentUser((prev: any) => ({
        ...prev,
        ...authorizerProfileForm,
        email: resp.data?.user?.email || authorizerProfileForm.email,
      }));
      setIsEditProfileOpen(false);
      toast({
        title: "Authorizer Profile Updated! ✨",
        description: "Your official authorizer governance profile has been saved.",
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

  // User Deletion State & Handler (Removes permanently from website and DB)
  const [userToDelete, setUserToDelete] = useState<{ id: number; email: string; role?: string; full_name?: string } | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    try {
      await apiClient.delete(API_ENDPOINTS.recruiter.authorizerDeleteUser(userToDelete.id));
      toast({
        title: "User Profile Deleted 🗑️",
        description: `User '${userToDelete.email}' has been permanently deleted from the website and database.`,
      });
      setUserToDelete(null);
      loadUsers();
      loadRecruiterRequests();
    } catch (err: any) {
      toast({
        title: "Deletion Failed",
        description: err?.response?.data?.detail || err?.message || "Failed to delete user profile.",
        variant: "destructive",
      });
    } finally {
      setDeletingUser(false);
    }
  };

  const pendingRequestsCount = recruiterRequests.filter(r => r.approval_status === "pending_approval").length;
  const approvedRecruitersCount = recruiterRequests.filter(r => r.approval_status === "approved").length;
  const pendingJobsCount = jobs.filter(j => j.status === "pending_approval").length;
  const approvedJobsCount = jobs.filter(j => j.status === "approved").length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Horizontal Sidebar Navigation */}
      <aside className="w-full md:w-64 lg:w-72 border-r border-white/10 bg-card/60 backdrop-blur-xl flex flex-col shrink-0 sticky top-0 md:h-screen z-30">
        {/* Brand Header */}
        <div className="h-16 border-b border-white/10 px-6 flex items-center justify-between">
          <Link to="/authorizer" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-600/25">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block">AutoAgentHire</span>
              <span className="text-[10px] text-purple-400 font-semibold tracking-wider uppercase">Authorizer Suite</span>
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
                ? "bg-purple-600 text-white font-semibold shadow-lg shadow-purple-600/30"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="flex-1 text-left">Dashboard</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("access_requests");
              loadRecruiterRequests();
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === "access_requests"
                ? "bg-purple-600 text-white font-semibold shadow-lg shadow-purple-600/30"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="flex-1 text-left">Access Permission</span>
            {pendingRequestsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-bold text-[10px]">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab("user_tracking");
              loadUsers();
              loadAuditLogs();
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === "user_tracking"
                ? "bg-purple-600 text-white font-semibold shadow-lg shadow-purple-600/30"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="flex-1 text-left">User Tracking</span>
            {pendingJobsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-purple-400/20 text-purple-300 font-bold text-[10px]">
                {pendingJobsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === "settings"
                ? "bg-purple-600 text-white font-semibold shadow-lg shadow-purple-600/30"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="flex-1 text-left">Profile & Settings</span>
          </button>

          {/* Quick Action: Create Recruiter Account */}
          <div className="pt-4 mt-4 border-t border-white/10">
            <Button
              onClick={() => setCreateRecruiterOpen(true)}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs gap-2 shadow-lg shadow-purple-600/20 rounded-xl py-5"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Recruiter Account</span>
            </Button>
          </div>
        </div>

        {/* Authorizer User Profile & Logout */}
        <div className="p-4 border-t border-white/10 bg-black/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-xs">
                AU
              </div>
              <div>
                <span className="text-xs font-semibold block text-foreground leading-none">Official Authorizer</span>
                <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">ID: AUTH-001</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 max-w-7xl">

        {/* SECTION 1: DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-purple-900/30 via-card to-card border border-purple-500/20">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Security & Access Governance Hub
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Authorizer Dashboard
                </h1>
                <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                  Central control portal for reviewing recruiter registration requests, managing permission access, and tracking job vacancy authorizations.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setActiveTab("access_requests")}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-2 shadow-lg shadow-purple-600/20"
                >
                  <UserCheck className="w-4 h-4" />
                  Review Access Requests
                  {pendingRequestsCount > 0 && (
                    <Badge variant="secondary" className="ml-1 bg-white/20 text-white text-[10px]">
                      {pendingRequestsCount}
                    </Badge>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setActiveTab("user_tracking");
                    loadUsers();
                    loadAuditLogs();
                  }}
                  className="gap-2 border-white/10 hover:bg-white/5"
                >
                  <Users className="w-4 h-4" />
                  User & Activity Tracking
                </Button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card variant="glass" className="border-white/10 hover:border-purple-500/30 transition-all">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">
                      Pending Access Requests
                    </span>
                    <span className="text-2xl font-bold mt-1 block text-amber-400">
                      {pendingRequestsCount}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Awaiting your approval</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <UserCheck className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10 hover:border-purple-500/30 transition-all">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">
                      Approved Recruiters
                    </span>
                    <span className="text-2xl font-bold mt-1 block text-emerald-400">
                      {approvedRecruitersCount}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Active login access</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Award className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10 hover:border-purple-500/30 transition-all">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">
                      Pending Job Authorizations
                    </span>
                    <span className="text-2xl font-bold mt-1 block text-purple-400">
                      {pendingJobsCount}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Vacancies to review</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <FileCheck className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10 hover:border-purple-500/30 transition-all">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">
                      Live Candidate Jobs
                    </span>
                    <span className="text-2xl font-bold mt-1 block text-primary">
                      {approvedJobsCount}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Published to candidates</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Briefcase className="w-6 h-6" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Overview Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Access Requests */}
              <Card variant="glass" className="border-white/10">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Latest Recruiter Access Requests</CardTitle>
                    <CardDescription className="text-xs">Recruiters waiting for login permission</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab("access_requests")}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    View All
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recruiterRequests.slice(0, 3).map((r) => (
                    <div key={r.id} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-foreground truncate">{r.company_name || r.email}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{r.full_name} • {r.email}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${
                          r.approval_status === "approved"
                            ? "border-emerald-500/40 text-emerald-400"
                            : r.approval_status === "rejected"
                            ? "border-destructive/40 text-destructive"
                            : "border-amber-500/40 text-amber-400"
                        }`}
                      >
                        {r.approval_status.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                  {recruiterRequests.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">No recruiter requests at this time.</p>
                  )}
                </CardContent>
              </Card>

              {/* Recent Job Authorizations */}
              <Card variant="glass" className="border-white/10">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Recent Job Postings Tracking</CardTitle>
                    <CardDescription className="text-xs">Job vacancies submitted by recruiters</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveTab("user_tracking");
                      setUserTrackingSubTab("jobs");
                      loadJobs();
                    }}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    View All
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {jobs.slice(0, 3).map((j) => (
                    <div key={j.id} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-foreground truncate">{j.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{j.company_name} • {j.vacancies} vacancies</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${
                          j.status === "approved"
                            ? "border-emerald-500/40 text-emerald-400"
                            : j.status === "rejected"
                            ? "border-destructive/40 text-destructive"
                            : "border-purple-500/40 text-purple-400"
                        }`}
                      >
                        {j.status.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                  {jobs.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">No job postings submitted yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* SECTION 2: ACCESS REQUESTS */}
        {activeTab === "access_requests" && (
          <div className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                Access Control & Permission Gate
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Recruiter Access Requests
              </h1>
              <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
                Recruiters cannot create accounts automatically. They submit registration requests here.
                With authorizer permission, recruiters gain access to log in to the website.
              </p>
            </div>

            {/* Filter Controls */}
            <div className="flex items-center justify-between gap-4 p-3 bg-muted/20 rounded-xl border border-white/5 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Filter Requests:</span>
                {[
                  { id: "pending_approval", label: "Pending Permission" },
                  { id: "approved", label: "Approved (Active Access)" },
                  { id: "rejected", label: "Rejected" },
                  { id: "all", label: "All Requests" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setRecruiterFilter(tab.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                      recruiterFilter === tab.id
                        ? "bg-purple-600 text-white font-semibold shadow-sm"
                        : "text-muted-foreground hover:bg-white/5"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-muted-foreground">
                {recruiterRequests.length} recruiter request(s) found
              </span>
            </div>

            {/* Recruiter Requests List */}
            {loadingRequests ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : recruiterRequests.length === 0 ? (
              <Card variant="glass" className="p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4 text-purple-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold mb-1">No Recruiter Requests Found</h3>
                <p className="text-muted-foreground max-w-sm mx-auto text-sm">
                  There are currently no recruiter accounts matching this filter.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {recruiterRequests.map((recruiter) => (
                  <Card
                    key={recruiter.id}
                    variant="glass"
                    className="border-white/10 hover:border-purple-500/30 transition-all flex flex-col justify-between"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-bold text-lg text-purple-400">
                            {recruiter.company_name ? recruiter.company_name.slice(0, 2).toUpperCase() : "RC"}
                          </div>
                          <div>
                            <CardTitle className="text-base font-semibold">
                              {recruiter.company_name || "Company / Organization"}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Recruiter: <span className="text-foreground font-medium">{recruiter.full_name || "Name not provided"}</span>
                            </p>
                          </div>
                        </div>

                        <Badge
                          variant="outline"
                          className={`text-xs capitalize ${
                            recruiter.approval_status === "approved"
                              ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                              : recruiter.approval_status === "rejected"
                              ? "border-destructive/40 text-destructive bg-destructive/10"
                              : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                          }`}
                        >
                          {recruiter.approval_status === "approved"
                            ? "Access Granted"
                            : recruiter.approval_status === "rejected"
                            ? "Access Denied"
                            : "Pending Permission"}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-2 text-xs">
                        {recruiter.custom_user_id && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                            <span className="text-[10px] text-purple-300 uppercase font-semibold">Official Recruiter ID</span>
                            <span className="font-mono font-bold text-xs text-purple-300 tracking-wider">{recruiter.custom_user_id}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 border border-white/5">
                          <Mail className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          <div className="truncate">
                            <span className="text-muted-foreground block text-[10px]">Official Recruiter Email</span>
                            <span className="font-mono text-foreground font-medium">{recruiter.email}</span>
                          </div>
                        </div>

                        {recruiter.created_at && (
                          <div className="flex items-center justify-between text-muted-foreground px-1">
                            <span>Request Submitted:</span>
                            <span className="font-mono">{new Date(recruiter.created_at).toLocaleString()}</span>
                          </div>
                        )}

                        {recruiter.approval_notes && (
                          <div className="p-2 rounded-lg bg-muted/30 border border-white/5 text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground">Authorizer Notes:</span> {recruiter.approval_notes}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="pt-3 border-t border-white/5 flex items-center justify-end gap-2.5">
                        {recruiter.approval_status === "pending_approval" ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={recruiterActionLoading}
                              onClick={() => {
                                setSelectedRecruiter(recruiter);
                                setRecruiterActionNotes("");
                              }}
                              className="text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              disabled={recruiterActionLoading}
                              onClick={() => handleRecruiterAction(recruiter.id, "approved", "Approved by Authorizer")}
                              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Approve & Grant Login Access
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setUserToDelete({
                                id: recruiter.id,
                                email: recruiter.email,
                                role: recruiter.role,
                                full_name: recruiter.full_name,
                              })}
                              className="text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10 gap-1 ml-auto"
                              title="Delete from website and database"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </Button>
                          </>
                        ) : recruiter.approval_status === "approved" ? (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" />
                              Login access is active
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={recruiterActionLoading}
                                onClick={() => handleRecruiterAction(recruiter.id, "rejected", "Revoked by Authorizer")}
                                className="text-xs h-7 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                              >
                                Revoke Access
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setUserToDelete({
                                  id: recruiter.id,
                                  email: recruiter.email,
                                  role: recruiter.role,
                                  full_name: recruiter.full_name,
                                })}
                                className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10 gap-1"
                                title="Delete from website and database"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-xs text-destructive flex items-center gap-1.5">
                              <XCircle className="w-4 h-4" />
                              Request was rejected
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={recruiterActionLoading}
                                onClick={() => handleRecruiterAction(recruiter.id, "approved", "Approved upon reconsideration")}
                                className="text-xs h-7 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                              >
                                Re-Approve Access
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setUserToDelete({
                                  id: recruiter.id,
                                  email: recruiter.email,
                                  role: recruiter.role,
                                  full_name: recruiter.full_name,
                                })}
                                className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10 gap-1"
                                title="Delete from website and database"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: USER TRACKING */}
        {activeTab === "user_tracking" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium mb-2">
                  <Users className="w-3.5 h-3.5" />
                  User & Audit Governance Hub
                </div>
                <h1 className="text-3xl font-bold tracking-tight">User Tracking & Activity</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  Inspect registered users across the platform, monitor job verification decisions, and review audit event logs.
                </p>
              </div>

              {/* Subtab Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border border-white/5">
                <button
                  onClick={() => {
                    setUserTrackingSubTab("users");
                    loadUsers();
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    userTrackingSubTab === "users"
                      ? "bg-purple-600 text-white font-semibold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Registered Users ({usersList.length})
                </button>
                <button
                  onClick={() => {
                    setUserTrackingSubTab("jobs");
                    loadJobs();
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    userTrackingSubTab === "jobs"
                      ? "bg-purple-600 text-white font-semibold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Job Verifications ({jobs.length})
                </button>
                <button
                  onClick={() => {
                    setUserTrackingSubTab("logins");
                    loadAuditLogs();
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    userTrackingSubTab === "logins"
                      ? "bg-purple-600 text-white font-semibold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Login History ({auditLogs.filter((l) => l.action === "login_success").length})
                </button>
                <button
                  onClick={() => {
                    setUserTrackingSubTab("audit");
                    loadAuditLogs();
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    userTrackingSubTab === "audit"
                      ? "bg-purple-600 text-white font-semibold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Audit Logs ({auditLogs.length})
                </button>
              </div>
            </div>

            {/* SubTab A: Registered Users */}
            {userTrackingSubTab === "users" && (
              <div className="space-y-4">
                {/* Search & Role Filter */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-muted/20 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Role:</span>
                    {[
                      { id: "all", label: "All Users" },
                      { id: "candidate", label: "Candidates" },
                      { id: "recruiter", label: "Recruiters" },
                      { id: "authorizer", label: "Authorizers" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setUserRoleFilter(tab.id)}
                        className={`text-xs px-2.5 py-1 rounded-md transition-all ${
                          userRoleFilter === tab.id
                            ? "bg-purple-600 text-white font-semibold"
                            : "text-muted-foreground hover:bg-white/5"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="Search email or name..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") loadUsers();
                      }}
                      className="w-full text-xs px-3 py-1.5 rounded-lg bg-background border border-white/10 text-foreground focus:outline-none focus:border-purple-500"
                    />
                    <Button size="sm" variant="ghost" onClick={loadUsers} className="text-xs h-7 px-2">
                      Search
                    </Button>
                  </div>
                </div>

                {loadingUsers ? (
                  <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : usersList.length === 0 ? (
                  <Card variant="glass" className="p-12 text-center">
                    <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-base font-semibold">No Users Found</h3>
                    <p className="text-xs text-muted-foreground mt-1">Try adjusting your role filter or search criteria.</p>
                  </Card>
                ) : (
                  <Card variant="glass" className="overflow-hidden border-white/10">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white/5 border-b border-white/10 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                          <tr>
                            <th className="py-3 px-4">User ID / Email</th>
                            <th className="py-3 px-4">Full Name</th>
                            <th className="py-3 px-4">Role</th>
                            <th className="py-3 px-4">Company / Org</th>
                            <th className="py-3 px-4">Account Status</th>
                            <th className="py-3 px-4">Registered Date</th>
                            <th className="py-3 px-4">Last Login</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-muted-foreground">
                          {usersList.map((u) => (
                            <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4 font-mono text-foreground font-medium">
                                {u.custom_user_id ? (
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Badge variant="outline" className="font-mono text-xs bg-purple-500/15 text-purple-300 border-purple-500/30 font-bold px-2 py-0.5 tracking-wider">
                                      {u.custom_user_id}
                                    </Badge>
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground">#{u.id}</div>
                                )}
                                <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{u.email}</div>
                              </td>
                              <td className="py-3 px-4 text-foreground font-medium">
                                {u.full_name || <span className="text-muted-foreground italic">None</span>}
                              </td>
                              <td className="py-3 px-4">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] capitalize font-medium ${
                                    u.role === "authorizer"
                                      ? "border-purple-500/40 text-purple-300 bg-purple-500/10"
                                      : u.role === "recruiter"
                                      ? "border-blue-500/40 text-blue-300 bg-blue-500/10"
                                      : "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                                  }`}
                                >
                                  {u.role}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-foreground">
                                {u.company_name || <span className="text-muted-foreground italic">—</span>}
                              </td>
                              <td className="py-3 px-4">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] capitalize ${
                                    u.is_active
                                      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                                      : "border-destructive/30 text-destructive bg-destructive/5"
                                  }`}
                                >
                                  {u.is_active ? "Active" : "Inactive"}
                                  {u.approval_status ? ` • ${u.approval_status}` : ""}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px]">
                                {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px]">
                                {u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setUserToDelete(u)}
                                  className="text-xs h-7 px-2.5 text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
                                  title="Permanently delete user profile from website and database"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete</span>
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* SubTab B: Job Postings Verification */}
            {userTrackingSubTab === "jobs" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 p-3 bg-muted/20 rounded-xl border border-white/5 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Filter Jobs:</span>
                    {[
                      { id: "pending_approval", label: "Pending Approval" },
                      { id: "approved", label: "Approved (Active)" },
                      { id: "rejected", label: "Rejected" },
                      { id: "all", label: "All Submissions" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setJobFilter(tab.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                          jobFilter === tab.id
                            ? "bg-purple-600 text-white font-semibold shadow-sm"
                            : "text-muted-foreground hover:bg-white/5"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{jobs.length} postings tracked</span>
                </div>

                {loadingJobs ? (
                  <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : jobs.length === 0 ? (
                  <Card variant="glass" className="p-12 text-center">
                    <CheckCircle2 className="w-10 h-10 text-purple-400 mx-auto mb-3" />
                    <h3 className="text-base font-semibold">No Jobs In This Status</h3>
                    <p className="text-xs text-muted-foreground mt-1">There are currently no job postings tracked under this filter.</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {jobs.map((job) => (
                      <Card key={job.id} variant="glass" className="border-white/10 hover:border-purple-500/30 transition-all">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={job.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                                alt={job.company_name}
                                className="w-11 h-11 rounded-xl object-cover bg-muted border border-white/10"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop";
                                }}
                              />
                              <div>
                                <CardTitle className="text-base font-semibold">{job.title}</CardTitle>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {job.company_name} {job.organization_symbol && `(${job.organization_symbol})`}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-xs capitalize ${
                                job.status === "approved"
                                  ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                  : job.status === "rejected"
                                  ? "border-destructive/40 text-destructive bg-destructive/10"
                                  : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                              }`}
                            >
                              {job.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
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

                          <p className="text-xs text-muted-foreground line-clamp-2">{job.description}</p>

                          {job.recruiting_process && (
                            <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/10 text-[11px] space-y-0.5">
                              <span className="font-semibold text-purple-300 block">Process of Recruiting:</span>
                              <p className="text-muted-foreground line-clamp-2">{job.recruiting_process}</p>
                            </div>
                          )}

                          <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-3">
                            <span className="text-[11px] text-muted-foreground">
                              Posted by: {job.recruiter_name || "Recruiter"}
                            </span>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setSelectedJob(job);
                                setJobAuthNotes(job.authorizer_notes || "");
                              }}
                              className="text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              Inspect & Authorize
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SubTab C: Audit Logs */}
            {userTrackingSubTab === "audit" && (
              <div className="space-y-4">
                <div className="p-3 bg-muted/20 rounded-xl border border-white/5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">
                    Showing last {auditLogs.length} security & administrative events
                  </span>
                  <Button size="sm" variant="ghost" onClick={loadAuditLogs} className="text-xs h-7">
                    Refresh Logs
                  </Button>
                </div>

                {auditLogs.length === 0 ? (
                  <Card variant="glass" className="p-12 text-center">
                    <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-base font-semibold">No Audit Logs Recorded</h3>
                    <p className="text-xs text-muted-foreground mt-1">Actions such as logins and permission reviews will be recorded here.</p>
                  </Card>
                ) : (
                  <Card variant="glass" className="overflow-hidden border-white/10">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white/5 border-b border-white/10 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                          <tr>
                            <th className="py-3 px-4">Event ID / Action</th>
                            <th className="py-3 px-4">Performed By</th>
                            <th className="py-3 px-4">Target Type</th>
                            <th className="py-3 px-4">Target ID</th>
                            <th className="py-3 px-4">Event Details</th>
                            <th className="py-3 px-4">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-muted-foreground">
                          {auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4 font-medium text-foreground">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    log.action.includes("approved") || log.action.includes("success")
                                      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                                      : log.action.includes("rejected")
                                      ? "border-destructive/30 text-destructive bg-destructive/5"
                                      : "border-purple-500/30 text-purple-400 bg-purple-500/5"
                                  }`}
                                >
                                  {log.action}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-foreground">
                                {log.performed_by_email || "System"}
                              </td>
                              <td className="py-3 px-4 capitalize">{log.target_type || "—"}</td>
                              <td className="py-3 px-4 font-mono">{log.target_id || "—"}</td>
                              <td className="py-3 px-4 font-mono text-[11px] max-w-[250px] truncate">
                                {log.details ? JSON.stringify(log.details) : "—"}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px]">
                                {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* SubTab D: Login History */}
            {userTrackingSubTab === "logins" && (
              <div className="space-y-4">
                <div className="p-3 bg-muted/20 rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-foreground font-semibold">User Authentication & Session History</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Tracks every successful login across Candidates, Recruiters, and Authorizers with timestamps and methods.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/10 text-xs px-2.5 py-1">
                      {auditLogs.filter((l) => l.action === "login_success").length} Recorded Sessions
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={loadAuditLogs} className="text-xs h-7">
                      Refresh Logins
                    </Button>
                  </div>
                </div>

                {auditLogs.filter((l) => l.action === "login_success").length === 0 ? (
                  <Card variant="glass" className="p-12 text-center">
                    <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-base font-semibold">No Login History Recorded</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      User login sessions and authentications will be recorded here automatically upon login.
                    </p>
                  </Card>
                ) : (
                  <Card variant="glass" className="overflow-hidden border-white/10">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white/5 border-b border-white/10 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                          <tr>
                            <th className="py-3 px-4">User / Email</th>
                            <th className="py-3 px-4">User ID / Role</th>
                            <th className="py-3 px-4">Auth Method</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Session Details</th>
                            <th className="py-3 px-4">Login Time (IST / Local)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-muted-foreground">
                          {auditLogs
                            .filter((l) => l.action === "login_success")
                            .map((log) => {
                              const details = (log.details && typeof log.details === "object") ? log.details : {};
                              const role = details.role || "user";
                              const method = details.method || "standard";
                              const customId = details.custom_user_id || `#${log.target_id || log.id}`;

                              return (
                                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                                  <td className="py-3 px-4 font-mono text-foreground font-medium">
                                    <div className="text-xs text-foreground font-semibold">
                                      {log.performed_by_email || "Unknown User"}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">Session ID: #{log.id}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Badge variant="outline" className="font-mono text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/20">
                                        {customId}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] capitalize ${
                                          role === "authorizer"
                                            ? "border-purple-500/40 text-purple-300 bg-purple-500/10"
                                            : role === "recruiter"
                                            ? "border-blue-500/40 text-blue-300 bg-blue-500/10"
                                            : "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                                        }`}
                                      >
                                        {role}
                                      </Badge>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge variant="outline" className="text-[10px] capitalize bg-white/5 border-white/10 text-foreground">
                                      {String(method).replace(/_/g, " ")}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                      Authenticated
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono text-[11px] max-w-[220px] truncate text-muted-foreground">
                                    {typeof details === "object" ? JSON.stringify(details) : String(details)}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-[11px] text-foreground">
                                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* SECTION 4: PROFILE & SETTINGS */}
        {activeTab === "settings" && (
          <div className="space-y-8 max-w-4xl">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Authorizer Profile & Settings
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Manage your credentials, system authorization identity, and security keys.
              </p>
            </div>

            {/* Profile Overview Card */}
            <Card variant="glass" className="border-purple-500/20 bg-gradient-to-r from-purple-900/10 via-card to-card">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                    Official Authorizer Account Details
                  </CardTitle>
                  <CardDescription>
                    Your central governance credentials, official Authorizer ID, and access privileges.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleOpenEditProfile}
                  className="bg-purple-600 hover:bg-purple-500 text-white gap-1.5 shadow-md shadow-purple-600/25 shrink-0"
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
                      src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop"}
                      alt={currentUser?.full_name || "Authorizer"}
                      className="w-24 h-24 rounded-2xl object-cover border-2 border-purple-500/40 shadow-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop";
                      }}
                    />
                    <button
                      onClick={handleOpenEditProfile}
                      className="absolute -bottom-2 -right-2 p-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 shadow-md"
                      title="Edit Photo"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-center sm:text-left space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <h3 className="text-xl font-bold text-foreground">
                        {currentUser?.full_name || "Official System Authorizer"}
                      </h3>
                      <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/30 text-xs">
                        Authorizer & System Admin
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-purple-400">
                      {currentUser?.job_role || "Principal Platform Authorizer & Governance Officer"}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{currentUser?.company_name || "AutoHire Central Authority"}</span>
                      &bull;
                      <MapPin className="w-3.5 h-3.5 ml-1" />
                      <span>{currentUser?.location || "San Francisco, CA (Pacific Time)"}</span>
                    </p>
                  </div>
                </div>

                {/* 2. Names, Mobile, Email, Education, Qualification, Job Role */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                      <User className="w-3 h-3 text-purple-400" />
                      Authorizer Full Name
                    </span>
                    <span className="text-sm font-bold text-foreground block">
                      {currentUser?.full_name || "Official System Authorizer"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-400" />
                      Mobile Number
                    </span>
                    <span className="text-sm font-semibold text-foreground font-mono block">
                      {currentUser?.phone || "+1 (555) 019-9000"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                      <Mail className="w-3 h-3 text-purple-400" />
                      Email Address
                    </span>
                    <span className="text-sm font-medium text-foreground truncate block">
                      {currentUser?.email || "authorizer@autohire.internal"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                    <span className="text-purple-300 block uppercase font-mono text-[10px] flex items-center gap-1">
                      <GraduationCap className="w-3 h-3" />
                      Education (College / University)
                    </span>
                    <span className="text-sm font-semibold text-foreground block">
                      {currentUser?.education || "Master of Science in Information Systems"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                    <span className="text-purple-300 block uppercase font-mono text-[10px] flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      Education Qualification
                    </span>
                    <span className="text-sm font-semibold text-foreground block">
                      {currentUser?.qualification || "Chief Governance Officer / CISO Certified"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                      <Briefcase className="w-3 h-3 text-blue-400" />
                      Designation / Job Role
                    </span>
                    <span className="text-sm font-bold text-purple-300 block">
                      {currentUser?.job_role || "Principal Platform Authorizer & Governance Officer"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px]">Authorizer ID</span>
                    <span className="text-sm font-bold text-purple-400 font-mono block">
                      {currentUser?.custom_user_id || "AUTH-001"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px]">Permission Scope</span>
                    <span className="text-sm font-semibold text-emerald-400 block">
                      Full System & Recruiter Governance
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-muted-foreground block uppercase font-mono text-[10px]">Scheduling Timezone</span>
                    <span className="text-sm font-mono text-foreground block">
                      Pacific Time (US/Pacific)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Change Password Card */}
            <Card variant="glass" className="border-white/10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="w-5 h-5 text-purple-400" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your authorizer portal password. Please provide your current password followed by your new password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
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

                  {/* Field 3: Confirm Password */}
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
                      className="bg-purple-600 hover:bg-purple-500 text-white gap-2 shadow-lg shadow-purple-600/30"
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
          </div>
        )}
      </main>

      {/* Reject Recruiter Request Modal */}
      <Dialog open={!!selectedRecruiter} onOpenChange={() => setSelectedRecruiter(null)}>
        <DialogContent className="max-w-md bg-card border-white/10 text-foreground">
          {selectedRecruiter && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
                  <UserX className="w-5 h-5" />
                  Reject Recruiter Registration
                </DialogTitle>
                <DialogDescription>
                  Are you sure you want to reject the registration request from{" "}
                  <strong>{selectedRecruiter.company_name || selectedRecruiter.email}</strong>?
                </DialogDescription>
              </DialogHeader>

              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">
                  Rejection Reason / Notes (Optional)
                </label>
                <Textarea
                  rows={3}
                  placeholder="e.g. Official company domain email verification required..."
                  value={recruiterActionNotes}
                  onChange={(e) => setRecruiterActionNotes(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedRecruiter(null)}
                  disabled={recruiterActionLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleRecruiterAction(selectedRecruiter.id, "rejected")}
                  disabled={recruiterActionLoading}
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Inspect and Authorize Job Modal */}
      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 text-foreground shadow-2xl p-6">
          {selectedJob && (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-purple-400" />
                    {selectedJob.title}
                  </DialogTitle>
                  <Badge variant="outline" className="capitalize text-xs">
                    {selectedJob.status.replace("_", " ")}
                  </Badge>
                </div>
                <DialogDescription>
                  {selectedJob.company_name} ({selectedJob.organization_symbol || "SYMBOL"}) • {selectedJob.location}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-white/5 border border-white/10 text-xs">
                <div>
                  <span className="text-muted-foreground block">Compensation</span>
                  <span className="font-medium text-foreground">{selectedJob.salary_description}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Vacancies</span>
                  <span className="font-medium text-foreground">{selectedJob.vacancies} open position(s)</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Application Starts (IST)</span>
                  <span className="font-mono text-foreground">{selectedJob.start_date_pt?.replace("T", " ")}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Application Deadline (IST)</span>
                  <span className="font-mono text-foreground">{selectedJob.final_date_pt?.replace("T", " ")}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Full Description</h4>
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {selectedJob.description}
                </div>
              </div>

              {selectedJob.requirements && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Requirements</h4>
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {selectedJob.requirements}
                  </div>
                </div>
              )}

              {selectedJob.recruiting_process && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-purple-300 mb-1">Process of Recruiting</h4>
                  <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {selectedJob.recruiting_process}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">
                  Authorizer Notes / Remarks (Optional)
                </label>
                <Textarea
                  rows={2}
                  placeholder="Notes for recruiter regarding compliance, dates, or specifications..."
                  value={jobAuthNotes}
                  onChange={(e) => setJobAuthNotes(e.target.value)}
                  className="text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedJob(null)}
                  disabled={jobActionLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleJobAction(selectedJob.id, "rejected")}
                  disabled={jobActionLoading}
                  className="gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Posting
                </Button>
                <Button
                  onClick={() => handleJobAction(selectedJob.id, "approved")}
                  disabled={jobActionLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve & Publish to Candidates
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Create Recruiter Account directly (Feature 2: 8-Character Recruiter ID) */}
      <Dialog open={createRecruiterOpen} onOpenChange={setCreateRecruiterOpen}>
        <DialogContent className="max-w-xl bg-card/95 border-purple-500/20 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-purple-300">
              <UserPlus className="w-5 h-5 text-purple-400" />
              Create Recruiter Account
            </DialogTitle>
            <DialogDescription>
              Create and directly authorize an official Recruiter account. The authoritative 8-character Recruiter ID (e.g. 0R00111A) is automatically generated following the platform formula.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateRecruiter} className="space-y-4 pt-2">
            {/* Field 1 & 2: Recruiter First Name and Last Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Recruiter's First Name *</Label>
                <Input
                  placeholder="e.g. Rahul"
                  value={newRecruiterForm.first_name}
                  onChange={(e) => setNewRecruiterForm({ ...newRecruiterForm, first_name: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Recruiter's Last Name *</Label>
                <Input
                  placeholder="e.g. Sharma"
                  value={newRecruiterForm.last_name}
                  onChange={(e) => setNewRecruiterForm({ ...newRecruiterForm, last_name: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>
            </div>

            {/* Field 3: Date of Birth in DD/MM/YYYY */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Date of Birth (DD/MM/YYYY) *</Label>
                <span className="text-[11px] text-muted-foreground">Format: DD/MM/YYYY</span>
              </div>
              <Input
                placeholder="e.g. 14/08/1998"
                value={newRecruiterForm.date_of_birth}
                onChange={(e) => setNewRecruiterForm({ ...newRecruiterForm, date_of_birth: e.target.value })}
                required
                className="mt-1 font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Used strictly to compute digits for the official 8-character Recruiter ID. Remains private.
              </p>
            </div>

            {/* Field 4: Generated Recruiter ID (Read-Only) */}
            <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase text-purple-300">Generated Recruiter ID (Read-Only)</Label>
                {generatedRecruiterId ? (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px] font-mono">
                    Pattern: ^[0-9][A-Z][0-9]&#123;5&#125;[A-Z]$ Verified
                  </Badge>
                ) : (
                  <span className="text-[10px] text-amber-400/90 italic">Awaiting valid name &amp; DOB</span>
                )}
              </div>
              <Input
                readOnly
                value={generatedRecruiterId || "Fill Name & DOB above to auto-generate (e.g. 0R00111A)"}
                className={`font-mono text-base tracking-widest font-bold bg-black/40 cursor-not-allowed ${
                  generatedRecruiterId ? "text-purple-300 border-purple-500/40" : "text-muted-foreground"
                }`}
              />
              {recruiterIdError && (
                <p className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{recruiterIdError}</span>
                </p>
              )}
              {generatedRecruiterId && (
                <p className="text-[11px] text-emerald-400/90 flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Official 8-Character ID generated: {generatedRecruiterId}</span>
                </p>
              )}
            </div>

            {/* Field 5: Official Company Email */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center justify-between">
                <span>Official Company Email *</span>
                <span className="text-[10px] text-purple-400 font-normal">Official Work Domain Only</span>
              </Label>
              <Input
                type="email"
                placeholder="recruiter@company.com"
                value={newRecruiterForm.email}
                onChange={(e) => setNewRecruiterForm({ ...newRecruiterForm, email: e.target.value })}
                required
                className={`mt-1 ${
                  isPersonalEmail(newRecruiterForm.email) ? "border-amber-500/50 text-amber-300" : ""
                }`}
              />
              {isPersonalEmail(newRecruiterForm.email) && (
                <div className="mt-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Official Corporate Email Required</span>
                    <span>Personal email domains (gmail, yahoo, outlook, etc.) are strictly prohibited for Recruiter accounts. Please enter an official work domain.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Field 6: Company Name */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Company Name *</Label>
              <Input
                placeholder="e.g. Acme Tech Corporation"
                value={newRecruiterForm.company_name}
                onChange={(e) => setNewRecruiterForm({ ...newRecruiterForm, company_name: e.target.value })}
                required
                className="mt-1"
              />
            </div>

            {/* Field 7: Password */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Initial Password *</Label>
              <Input
                type="password"
                placeholder="Set initial password (min 6 characters)"
                value={newRecruiterForm.password}
                onChange={(e) => setNewRecruiterForm({ ...newRecruiterForm, password: e.target.value })}
                required
                minLength={6}
                className="mt-1"
              />
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateRecruiterOpen(false)}
                disabled={creatingRecruiter}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingRecruiter || !generatedRecruiterId}
                className="bg-purple-600 hover:bg-purple-500 text-white gap-2 shadow-lg shadow-purple-600/30"
              >
                {creatingRecruiter ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Create & Authorize Recruiter
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Authorizer Profile Edit Modal (Centered on Screen) */}
      <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-xl border-purple-500/20 text-foreground shadow-2xl p-6">
          <DialogHeader className="pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Edit Authorizer Profile</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Update your system governance credentials, official designation, and authority details.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveAuthorizerProfile} className="space-y-5 pt-2">
            {/* Avatar & Photo Section */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-purple-400" />
                Profile Photo *
              </Label>
              <div className="flex items-center gap-4">
                <img
                  src={authorizerProfileForm.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop"}
                  alt="Avatar Preview"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-purple-500/40 shadow-md bg-muted flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop";
                  }}
                />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-all shadow-sm">
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
                                setAuthorizerProfileForm((prev) => ({ ...prev, avatar_url: base64 }));
                                toast({
                                  title: "Photo Selected",
                                  description: "Your authorizer profile photo is ready to save.",
                                });
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                    {authorizerProfileForm.avatar_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAuthorizerProfileForm((prev) => ({ ...prev, avatar_url: "" }))}
                        className="text-xs text-muted-foreground hover:text-destructive h-7"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Upload official governance photo from device (JPG/PNG/WebP under 5MB).
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-purple-400" />
                  Full Name *
                </Label>
                <Input
                  required
                  placeholder="e.g. Official System Authorizer"
                  value={authorizerProfileForm.full_name}
                  onChange={(e) => setAuthorizerProfileForm({ ...authorizerProfileForm, full_name: e.target.value })}
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
                  <span className="text-[10px] text-purple-400 font-normal">All country formats allowed</span>
                </Label>
                <Input
                  required
                  placeholder="e.g. +91 98765 43210, +1 (555) 019-9000, +44 7911 123456"
                  value={authorizerProfileForm.phone}
                  onChange={(e) => setAuthorizerProfileForm({ ...authorizerProfileForm, phone: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
                <p className="text-[10px] text-muted-foreground">
                  Accepts any international mobile number with country code (+91, +1, +44, +61, +971, etc.)
                </p>
              </div>

              {/* Job Role / Designation */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-purple-400" />
                  Designation / Role *
                </Label>
                <Input
                  required
                  placeholder="e.g. Principal Governance Officer"
                  value={authorizerProfileForm.job_role}
                  onChange={(e) => setAuthorizerProfileForm({ ...authorizerProfileForm, job_role: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
              </div>

              {/* Company / Authority Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  Authority / Organization *
                </Label>
                <Input
                  required
                  placeholder="e.g. AutoHire Central Authority"
                  value={authorizerProfileForm.company_name}
                  onChange={(e) => setAuthorizerProfileForm({ ...authorizerProfileForm, company_name: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
              </div>

              {/* Education / University */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
                  Education (College / University) *
                </Label>
                <Input
                  required
                  placeholder="e.g. Master of Science in Information Systems"
                  value={authorizerProfileForm.education}
                  onChange={(e) => setAuthorizerProfileForm({ ...authorizerProfileForm, education: e.target.value })}
                  className="bg-black/30 border-white/10"
                />
              </div>

              {/* Qualification */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-purple-400" />
                  Qualification / Certification *
                </Label>
                <Input
                  required
                  placeholder="e.g. Chief Governance Officer / CISO Certified"
                  value={authorizerProfileForm.qualification}
                  onChange={(e) => setAuthorizerProfileForm({ ...authorizerProfileForm, qualification: e.target.value })}
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
                value={authorizerProfileForm.location}
                onChange={(e) => setAuthorizerProfileForm({ ...authorizerProfileForm, location: e.target.value })}
                className="bg-black/30 border-white/10"
              />
            </div>

            {/* Editable Official Email Address with Warning Banner */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-purple-400" />
                  Official Authorizer Email Address *
                </span>
                <span className="text-[10px] text-purple-400 font-normal">Official / Corporate Domain Only</span>
              </Label>
              <Input
                type="email"
                required
                placeholder="e.g. authorizer@autohire.internal, compliance@organization.com"
                value={authorizerProfileForm.email}
                onChange={(e) => setAuthorizerProfileForm({ ...authorizerProfileForm, email: e.target.value })}
                className={`bg-black/30 ${
                  isPersonalEmail(authorizerProfileForm.email) ? "border-amber-500/50 text-amber-300" : "border-white/10"
                }`}
              />
              {isPersonalEmail(authorizerProfileForm.email) ? (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Official Corporate Email Only</span>
                    <span>Personal email domains (gmail.com, yahoo.com, etc.) are strictly prohibited. Please provide your official institutional or company email.</span>
                  </div>
                </div>
              ) : authorizerProfileForm.email.trim().toLowerCase() !== (currentUser?.email || "").trim().toLowerCase() ? (
                <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-400 flex-shrink-0" />
                    <span>Official Email Change &bull; Verification code will be sent on save</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isRequestingOtp}
                    onClick={() => handleInitiateEmailVerification(authorizerProfileForm.email)}
                    className="h-6 text-[10px] px-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200"
                  >
                    {isRequestingOtp ? "Sending..." : "Verify Now"}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>Used as sender/reply-to for official client job application certifications</span>
                  <span className="font-mono text-purple-400">ID: {currentUser?.custom_user_id || "AUTH-001"}</span>
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
                className="bg-purple-600 hover:bg-purple-500 text-white gap-2 shadow-lg shadow-purple-600/30 min-w-[130px]"
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

      {/* Official Email Verification Modal */}
      <Dialog open={isVerifyEmailOpen} onOpenChange={setIsVerifyEmailOpen}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-purple-500/30 text-foreground shadow-2xl p-6">
          <DialogHeader className="space-y-2 text-center">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mx-auto mb-1">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">
              Verify Official Authorizer Email
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
                className="bg-black/40 border-purple-500/40 text-center font-mono text-2xl tracking-[8px] font-bold py-6 text-purple-300"
              />
              <p className="text-[11px] text-muted-foreground text-center">
                Code expires in 15 minutes. Check your official inbox or spam folder.
              </p>
            </div>


            <div className="pt-1 flex items-center justify-between text-xs">
              <button
                type="button"
                disabled={isRequestingOtp}
                onClick={() => handleInitiateEmailVerification(pendingEmailToVerify)}
                className="text-purple-400 hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
              >
                {isRequestingOtp ? "Sending..." : "Resend Code"}
              </button>
              <span className="text-muted-foreground text-[11px]">Authorizer Security Registry</span>
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
                className="bg-purple-600 hover:bg-purple-500 text-white gap-2 text-xs shadow-lg shadow-purple-600/30"
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

      {/* Delete User Confirmation Modal (Centered on Screen) */}
      <Dialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-destructive/30 text-foreground shadow-2xl p-6">
          <DialogHeader className="space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-1">
              <Trash2 className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">
              Permanently Delete User Profile?
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              This action will completely remove this account and all associated applications, resumes, and data from both the website and the database.
            </DialogDescription>
          </DialogHeader>

          {userToDelete && (
            <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20 text-xs space-y-1 my-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">User Email:</span>
                <span className="font-semibold text-foreground">{userToDelete.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">User ID / Record:</span>
                <span className="font-mono text-primary font-bold">#{userToDelete.id}</span>
              </div>
              {userToDelete.role && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account Role:</span>
                  <span className="capitalize text-foreground font-medium">{userToDelete.role}</span>
                </div>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={deletingUser}
              onClick={() => setUserToDelete(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deletingUser}
              onClick={handleConfirmDeleteUser}
              className="bg-destructive hover:bg-destructive/90 text-white gap-2 text-xs"
            >
              {deletingUser ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Deleting from Database...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirm Delete</span>
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
