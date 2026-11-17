import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, Building2,
  DollarSign, Users, Calendar, MapPin, LogOut, Filter, UserCheck,
  UserX, Mail, Sparkles, Briefcase, ChevronRight, AlertCircle, FileCheck,
  LayoutDashboard, TrendingUp, ShieldAlert, Award, UserPlus, Key, Settings, Lock,
  Camera, User, Phone, GraduationCap, Edit3, Trash2,
  Database, RefreshCw, Layers, Plug, ExternalLink, Check, AlertTriangle, Search,
  Eye, Loader2, ArrowUpRight, History, Server, Globe, CheckSquare, Square
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
import { getCleanJobDescriptionPreview } from "@/components/JobDescriptionRenderer";

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

interface PortalIntegrationRecord {
  id: number;
  uuid: string;
  provider: string;
  name: string;
  api_base_url?: string;
  masked_api_key: string;
  config?: Record<string, any>;
  status: string;
  last_sync_at?: string;
  last_error?: string;
  imported_count: number;
  created_at?: string;
}

interface SyncHistoryRecord {
  id: number;
  integration_id: number;
  status: string;
  records_imported: number;
  records_updated: number;
  records_failed: number;
  error_message?: string;
  synced_at: string;
}

interface ImportedApplicationRecord {
  id: number;
  uuid: string;
  provider: string;
  external_application_id: string;
  job_title: string;
  company_name: string;
  job_location?: string;
  application_date?: string;
  application_status: string;
  job_description?: string;
  job_posting_url?: string;
  candidate_name?: string;
  candidate_email?: string;
  created_at?: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  supported: boolean;
  description: string;
  docs_url?: string;
  notice?: string;
  auth_type?: string;
  base_url_placeholder?: string;
}

interface DatabaseHealthData {
  status: string;
  database_type: string;
  query_healthy: boolean;
  latency_ms: number;
  tables: Record<string, { available: boolean; record_count: number }>;
  checked_at: string;
  mongo_status?: any;
}

export default function AuthorizerPortal() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();

  // Primary Sections: 'dashboard' | 'access_requests' | 'user_tracking' | 'integrations' | 'settings'
  const validTabs = ["dashboard", "access_requests", "user_tracking", "integrations", "settings"] as const;
  type AuthorizerTab = typeof validTabs[number];

  const urlTab = searchParams.get("tab") as AuthorizerTab;
  const initialActiveTab: AuthorizerTab = validTabs.includes(urlTab) ? urlTab : "dashboard";
  const [activeTab, setActiveTabState] = useState<AuthorizerTab>(initialActiveTab);

  const setActiveTab = (tab: AuthorizerTab) => {
    setActiveTabState(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "dashboard") {
        next.delete("tab");
      } else {
        next.set("tab", tab);
      }
      return next;
    }, { replace: true });
  };

  // Profile Loading & Error State
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

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

  // Integrations State
  const [integrations, setIntegrations] = useState<PortalIntegrationRecord[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [importedApplications, setImportedApplications] = useState<ImportedApplicationRecord[]>([]);
  const [loadingImportedApps, setLoadingImportedApps] = useState(false);
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [appProviderFilter, setAppProviderFilter] = useState("all");

  const [selectedIntegrationForHistory, setSelectedIntegrationForHistory] = useState<PortalIntegrationRecord | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryRecord[]>([]);
  const [loadingSyncHistory, setLoadingSyncHistory] = useState(false);
  const [isSyncHistoryOpen, setIsSyncHistoryOpen] = useState(false);

  const [isAddIntegrationOpen, setIsAddIntegrationOpen] = useState(false);
  const [creatingIntegration, setCreatingIntegration] = useState(false);
  const [syncingIntegrationId, setSyncingIntegrationId] = useState<number | null>(null);
  const [validatingIntegrationId, setValidatingIntegrationId] = useState<number | null>(null);
  const [disconnectingIntegrationId, setDisconnectingIntegrationId] = useState<number | null>(null);

  const [addIntegrationForm, setAddIntegrationForm] = useState({
    provider: "greenhouse",
    name: "",
    api_key: "",
    api_base_url: "",
  });
  const [subdomainInput, setSubdomainInput] = useState("");

  // Website URL Job Import State
  const [isWebsiteImportOpen, setIsWebsiteImportOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteConnectionName, setWebsiteConnectionName] = useState("");
  const [isScanningWebsite, setIsScanningWebsite] = useState(false);
  const [isImportingWebsite, setIsImportingWebsite] = useState(false);
  const [discoveredJobs, setDiscoveredJobs] = useState<any[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [scanResultMeta, setScanResultMeta] = useState<any>(null);
  const [websiteImportHistory, setWebsiteImportHistory] = useState<any[]>([]);
  const [loadingWebsiteHistory, setLoadingWebsiteHistory] = useState(false);

  // Database Health State
  const [dbHealthData, setDbHealthData] = useState<DatabaseHealthData | null>(null);
  const [loadingDbHealth, setLoadingDbHealth] = useState(false);
  const [dbHealthError, setDbHealthError] = useState<string | null>(null);
  const [lastDbHealthCheckedAt, setLastDbHealthCheckedAt] = useState<string | null>(null);

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

  const getInitials = (name?: string, email?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (email && email.trim()) {
      return email.trim().slice(0, 2).toUpperCase();
    }
    return "AU";
  };

  const loadAuthorizerProfile = async () => {
    setLoadingProfile(true);
    setProfileError(null);
    try {
      const token = localStorage.getItem("authToken") || localStorage.getItem("token") || localStorage.getItem("access_token");
      if (!token) {
        navigate("/login");
        return;
      }

      const resp = await apiClient.get(API_ENDPOINTS.auth.me);
      if (resp.data) {
        if (resp.data.role !== "authorizer" && resp.data.role !== "admin") {
          toast({
            title: "Access Restricted",
            description: "Authorizer governance permissions required to access this portal.",
            variant: "destructive",
          });
          navigate("/");
          return;
        }
        setCurrentUser(resp.data);
      } else {
        setProfileError("No account data received from session.");
      }
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate("/login");
        return;
      }
      console.error("Failed to load authorizer profile:", err);
      setProfileError(err?.response?.data?.detail || err?.message || "Failed to load authenticated profile");
    } finally {
      setLoadingProfile(false);
    }
  };

  // ── Integrations & Health Management ───────────────────────────────────────

  const loadIntegrations = async () => {
    setLoadingIntegrations(true);
    try {
      const resp = await apiClient.get(API_ENDPOINTS.integrations.list);
      setIntegrations(resp.data || []);
    } catch (err: any) {
      console.error("Failed to load integrations:", err);
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const loadProviders = async () => {
    try {
      const resp = await apiClient.get(API_ENDPOINTS.integrations.providers);
      setProviders(resp.data || []);
    } catch (err: any) {
      console.error("Failed to load integration providers:", err);
    }
  };

  const loadImportedApplications = async (filterProvider = appProviderFilter, search = appSearchQuery) => {
    setLoadingImportedApps(true);
    try {
      let url = `${API_ENDPOINTS.integrations.applications}?limit=50`;
      if (filterProvider && filterProvider !== "all") {
        url += `&provider=${encodeURIComponent(filterProvider)}`;
      }
      if (search && search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`;
      }
      const resp = await apiClient.get(url);
      setImportedApplications(resp.data || []);
    } catch (err: any) {
      console.error("Failed to load imported applications:", err);
    } finally {
      setLoadingImportedApps(false);
    }
  };

  const loadDatabaseHealth = async () => {
    setLoadingDbHealth(true);
    setDbHealthError(null);
    try {
      const resp = await apiClient.get(API_ENDPOINTS.admin.databaseHealth);
      setDbHealthData(resp.data);
      setLastDbHealthCheckedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error("Database health check failed:", err);
      setDbHealthError(err?.response?.data?.detail || err?.message || "Database health inspection failed");
    } finally {
      setLoadingDbHealth(false);
    }
  };

  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addIntegrationForm.name.trim() || !addIntegrationForm.api_key.trim() || !addIntegrationForm.provider) {
      toast({
        title: "Required Fields Missing",
        description: "Provider, Connection Name, and API Key/Token are mandatory.",
        variant: "destructive",
      });
      return;
    }

    setCreatingIntegration(true);
    try {
      const payload: any = {
        provider: addIntegrationForm.provider,
        name: addIntegrationForm.name.trim(),
        api_key: addIntegrationForm.api_key.trim(),
      };
      if (addIntegrationForm.api_base_url.trim()) {
        payload.api_base_url = addIntegrationForm.api_base_url.trim();
      }
      if (addIntegrationForm.provider === "workable" && subdomainInput.trim()) {
        payload.config = { subdomain: subdomainInput.trim() };
      }

      await apiClient.post(API_ENDPOINTS.integrations.create, payload);
      toast({
        title: "Integration Connected! ✨",
        description: `Successfully authenticated and connected with ${addIntegrationForm.name}.`,
      });
      setIsAddIntegrationOpen(false);
      setAddIntegrationForm({
        provider: "greenhouse",
        name: "",
        api_key: "",
        api_base_url: "",
      });
      setSubdomainInput("");
      loadIntegrations();
      loadImportedApplications();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Failed to connect portal integration";
      toast({
        title: "Connection Failed",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setCreatingIntegration(false);
    }
  };

  const handleSyncIntegration = async (id: number, name: string) => {
    setSyncingIntegrationId(id);
    try {
      const resp = await apiClient.post(API_ENDPOINTS.integrations.sync(id));
      const res = resp.data;
      toast({
        title: `Sync Complete: ${name}`,
        description: `Imported ${res.records_imported} new, updated ${res.records_updated}, failed ${res.records_failed}.`,
      });
      loadIntegrations();
      loadImportedApplications();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Sync failed";
      toast({
        title: "Synchronization Error",
        description: detail,
        variant: "destructive",
      });
      loadIntegrations();
    } finally {
      setSyncingIntegrationId(null);
    }
  };

  const handleValidateIntegration = async (id: number, name: string) => {
    setValidatingIntegrationId(id);
    try {
      const resp = await apiClient.post(API_ENDPOINTS.integrations.validate(id));
      if (resp.data.valid) {
        toast({
          title: "Connection Verified ✅",
          description: resp.data.message || `${name} connection credentials are valid.`,
        });
      } else {
        toast({
          title: "Validation Warning ⚠️",
          description: resp.data.message || "Provider returned an authentication error.",
          variant: "destructive",
        });
      }
      loadIntegrations();
    } catch (err: any) {
      toast({
        title: "Validation Failed",
        description: err?.response?.data?.detail || err?.message || "Failed to validate credentials",
        variant: "destructive",
      });
    } finally {
      setValidatingIntegrationId(null);
    }
  };

  const handleDisconnectIntegration = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to disconnect "${name}"? Existing imported records will remain safely saved in your database.`)) {
      return;
    }
    setDisconnectingIntegrationId(id);
    try {
      await apiClient.delete(API_ENDPOINTS.integrations.delete(id));
      toast({
        title: "Integration Disconnected",
        description: `${name} has been disconnected and credentials securely wiped.`,
      });
      loadIntegrations();
    } catch (err: any) {
      toast({
        title: "Disconnect Failed",
        description: err?.response?.data?.detail || err?.message || "Failed to disconnect integration",
        variant: "destructive",
      });
    } finally {
      setDisconnectingIntegrationId(null);
    }
  };

  const handleOpenSyncHistory = async (integration: PortalIntegrationRecord) => {
    setSelectedIntegrationForHistory(integration);
    setIsSyncHistoryOpen(true);
    setLoadingSyncHistory(true);
    try {
      const resp = await apiClient.get(API_ENDPOINTS.integrations.history(integration.id));
      setSyncHistory(resp.data || []);
    } catch (err: any) {
      console.error("Failed to load sync history:", err);
      setSyncHistory([]);
    } finally {
      setLoadingSyncHistory(false);
    }
  };

  // ── Website URL Job Import Handlers ─────────────────────────────────────────

  const handleScanWebsite = async () => {
    if (!websiteUrl.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a valid company careers URL (e.g. https://company.com/careers).",
        variant: "destructive",
      });
      return;
    }
    setIsScanningWebsite(true);
    setDiscoveredJobs([]);
    setSelectedJobIds(new Set());
    setScanResultMeta(null);
    try {
      const resp = await apiClient.post(API_ENDPOINTS.integrations.websiteScan, {
        url: websiteUrl.trim(),
        connection_name: websiteConnectionName.trim() || undefined,
        max_jobs: 50,
      });
      const data = resp.data;
      const jobs = data.discovered_jobs || [];
      setDiscoveredJobs(jobs);
      setScanResultMeta({
        total_found: data.total_found,
        crawl_method: data.crawl_method,
        company_name: data.company_name,
        already_imported_count: data.already_imported_count,
        new_jobs_count: data.new_jobs_count,
        warnings: data.warnings,
      });

      // Default select jobs that are not already imported
      const initialSelected = new Set<string>();
      jobs.forEach((j: any) => {
        if (!j.is_already_imported) {
          initialSelected.add(j.temp_id);
        }
      });
      if (initialSelected.size === 0 && jobs.length > 0) {
        jobs.forEach((j: any) => initialSelected.add(j.temp_id));
      }
      setSelectedJobIds(initialSelected);

      toast({
        title: "Careers Website Scanned",
        description: `Discovered ${jobs.length} position${jobs.length === 1 ? "" : "s"} (${data.new_jobs_count} new, ${data.already_imported_count} already in database).`,
      });
    } catch (err: any) {
      toast({
        title: "Website Scan Failed",
        description: err.response?.data?.detail || err.message || "Failed to scan careers website for job listings.",
        variant: "destructive",
      });
    } finally {
      setIsScanningWebsite(false);
    }
  };

  const handleToggleSelectJob = (tempId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) {
        next.delete(tempId);
      } else {
        next.add(tempId);
      }
      return next;
    });
  };

  const handleSelectAllJobs = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedJobIds(new Set(discoveredJobs.map((j) => j.temp_id)));
    } else {
      setSelectedJobIds(new Set());
    }
  };

  const handleImportSelectedWebsiteJobs = async () => {
    if (selectedJobIds.size === 0) {
      toast({
        title: "No Jobs Selected",
        description: "Please select at least one job posting to import into your portal database.",
        variant: "destructive",
      });
      return;
    }
    const jobsToImport = discoveredJobs.filter((j) => selectedJobIds.has(j.temp_id));
    setIsImportingWebsite(true);
    try {
      const resp = await apiClient.post(API_ENDPOINTS.integrations.websiteImport, {
        url: websiteUrl.trim(),
        connection_name: websiteConnectionName.trim() || undefined,
        selected_jobs: jobsToImport,
      });
      const data = resp.data;
      toast({
        title: "Jobs Imported Successfully",
        description: `Imported ${data.imported_count} new listings, updated ${data.updated_count}, skipped ${data.skipped_count}.`,
      });
      loadIntegrations();
      loadWebsiteImportHistory();
      setIsWebsiteImportOpen(false);
      // Reset scan state
      setDiscoveredJobs([]);
      setSelectedJobIds(new Set());
      setScanResultMeta(null);
      setWebsiteUrl("");
      setWebsiteConnectionName("");
    } catch (err: any) {
      toast({
        title: "Job Import Failed",
        description: err.response?.data?.detail || err.message || "Failed to import selected job listings.",
        variant: "destructive",
      });
    } finally {
      setIsImportingWebsite(false);
    }
  };

  const loadWebsiteImportHistory = async () => {
    setLoadingWebsiteHistory(true);
    try {
      const resp = await apiClient.get(API_ENDPOINTS.integrations.websiteHistory);
      if (resp.data && Array.isArray(resp.data.history)) {
        setWebsiteImportHistory(resp.data.history);
      }
    } catch (err) {
      console.warn("Failed to load website import history:", err);
    } finally {
      setLoadingWebsiteHistory(false);
    }
  };

  useEffect(() => {
    loadAuthorizerProfile();
    loadProviders();
  }, []);

  useEffect(() => {
    if (activeTab === "integrations") {
      loadIntegrations();
      loadImportedApplications();
      loadDatabaseHealth();
    }
  }, [activeTab]);

  const handleOpenEditProfile = () => {
    setAuthorizerProfileForm({
      avatar_url: currentUser?.avatar_url || "",
      full_name: currentUser?.full_name || "",
      email: currentUser?.email || "",
      phone: currentUser?.phone || "",
      education: currentUser?.education || "",
      qualification: currentUser?.qualification || "",
      job_role: currentUser?.job_role || "",
      company_name: currentUser?.company_name || "",
      location: currentUser?.location || "",
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
    <div className="min-h-screen bg-[#F7F5EF] text-[#202722] flex flex-col md:flex-row">
      {/* Deep Forest Green Editorial Sidebar Navigation */}
      <aside className="w-full md:w-64 lg:w-72 border-r border-[#123B32]/30 bg-[#123B32] text-[#F7F5EF] flex flex-col shrink-0 sticky top-0 md:h-screen z-30">
        {/* Brand Header */}
        <div className="h-20 border-b border-white/10 px-6 flex items-center justify-between">
          <Link to="/authorizer" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FF7058] text-white flex items-center justify-center font-bold shadow-sm shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-serif font-bold text-lg text-white tracking-tight block">AutoAgentHire</span>
              <span className="text-[10px] text-[#A9BBA7] font-semibold tracking-wider uppercase">Authorizer Suite</span>
            </div>
          </Link>
        </div>

        {/* Sidebar Navigation Items */}
        <div className="p-4 space-y-1.5 flex-1">
          <div className="text-[10px] font-semibold text-[#A9BBA7] uppercase tracking-wider px-3 mb-2">
            Governance Navigation
          </div>

          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "dashboard"
                ? "bg-white/10 text-white border-l-2 border-[#FF7058] shadow-xs"
                : "text-[#A9BBA7] hover:text-white hover:bg-white/5"
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
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "access_requests"
                ? "bg-white/10 text-white border-l-2 border-[#FF7058] shadow-xs"
                : "text-[#A9BBA7] hover:text-white hover:bg-white/5"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="flex-1 text-left">Access Permission</span>
            {pendingRequestsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#FF7058] text-white font-bold text-[10px]">
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
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "user_tracking"
                ? "bg-white/10 text-white border-l-2 border-[#FF7058] shadow-xs"
                : "text-[#A9BBA7] hover:text-white hover:bg-white/5"
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="flex-1 text-left">User Tracking</span>
            {pendingJobsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#FF7058] text-white font-bold text-[10px]">
                {pendingJobsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab("integrations");
              loadIntegrations();
              loadProviders();
              loadImportedApplications();
              loadDatabaseHealth();
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "integrations"
                ? "bg-white/10 text-white border-l-2 border-[#FF7058] shadow-xs"
                : "text-[#A9BBA7] hover:text-white hover:bg-white/5"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="flex-1 text-left">API Integrations</span>
            {integrations.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                {integrations.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "settings"
                ? "bg-white/10 text-white border-l-2 border-[#FF7058] shadow-xs"
                : "text-[#A9BBA7] hover:text-white hover:bg-white/5"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="flex-1 text-left">Profile & Settings</span>
          </button>

          {/* Quick Action: Create Recruiter Account */}
          <div className="pt-4 mt-4 border-t border-white/10">
            <Button
              onClick={() => setCreateRecruiterOpen(true)}
              className="w-full bg-[#FF7058] hover:bg-[#FA5D42] text-white text-xs gap-2 shadow-sm rounded-lg py-5 font-semibold"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Recruiter Account</span>
            </Button>
          </div>
        </div>

        {/* Authorizer User Profile & Logout */}
        <div className="p-4 border-t border-white/10 bg-black/10">
          <div className="flex items-center justify-between">
            {loadingProfile ? (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 animate-pulse shrink-0" />
                <div className="space-y-1">
                  <div className="w-24 h-3 bg-white/10 rounded animate-pulse" />
                  <div className="w-16 h-2 bg-white/10 rounded animate-pulse" />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {getInitials(currentUser?.full_name, currentUser?.email)}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold block text-white leading-none truncate max-w-[130px]" title={currentUser?.full_name || currentUser?.email}>
                    {currentUser?.full_name || currentUser?.email || "Authorized User"}
                  </span>
                  <span className="text-[10px] text-[#A9BBA7] font-mono mt-0.5 block truncate max-w-[130px]">
                    {currentUser?.custom_user_id || (currentUser?.id ? `AUTH-${currentUser.id}` : "AUTH-USER")}
                  </span>
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-[#A9BBA7] hover:text-red-400 hover:bg-white/5 shrink-0"
              title="Sign Out"
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

                          <p className="text-xs text-muted-foreground line-clamp-2">{getCleanJobDescriptionPreview(job.description, 160)}</p>

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

        {/* SECTION 4: API INTEGRATIONS & ATS SYNC */}
        {activeTab === "integrations" && (
          <div className="space-y-8 max-w-7xl">
            {/* Header & Quick Action */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-emerald-950/40 via-card to-card border border-emerald-500/20">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-2">
                  <Layers className="w-3.5 h-3.5" />
                  Enterprise ATS & Job Portal Ingestion Pipeline
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Portal API Integrations
                </h1>
                <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                  Connect, synchronize, and monitor enterprise ATS platforms. Credentials are encrypted server-side with AES-256 (Fernet) and never exposed.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={loadDatabaseHealth}
                  variant="outline"
                  size="sm"
                  disabled={loadingDbHealth}
                  className="border-white/10 text-xs gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDbHealth ? "animate-spin" : ""}`} />
                  <span>Audit Database</span>
                </Button>
                <Button
                  onClick={() => setIsAddIntegrationOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-xs shadow-md shadow-emerald-600/20"
                >
                  <Plug className="w-4 h-4" />
                  <span>Connect Job Portal</span>
                </Button>
                <Button
                  onClick={() => {
                    setIsWebsiteImportOpen(true);
                    loadWebsiteImportHistory();
                  }}
                  className="bg-teal-600 hover:bg-teal-500 text-white gap-2 text-xs shadow-md shadow-teal-600/20"
                >
                  <Globe className="w-4 h-4" />
                  <span>Import via Website URL</span>
                </Button>
              </div>
            </div>

            {/* Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card variant="glass" className="border-white/10">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-mono">Connected Portals</span>
                    <h3 className="text-2xl font-bold mt-1 text-foreground">{integrations.length}</h3>
                    <p className="text-[11px] text-emerald-400 mt-0.5">Active Integrations</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Plug className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-mono">Imported Applications</span>
                    <h3 className="text-2xl font-bold mt-1 text-foreground">
                      {integrations.reduce((sum, item) => sum + (item.imported_count || 0), 0)}
                    </h3>
                    <p className="text-[11px] text-purple-400 mt-0.5">Deduplicated Records</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <FileCheck className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-mono">Security Standard</span>
                    <h3 className="text-lg font-bold mt-1 text-foreground">AES-256 Fernet</h3>
                    <p className="text-[11px] text-emerald-400 mt-0.5">Zero Plaintext Storage</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Lock className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-mono">Database Health</span>
                    <h3 className="text-lg font-bold mt-1 text-foreground">
                      {dbHealthData?.status === "healthy" ? "100% Operational" : "Checking..."}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {dbHealthData?.latency_ms ? `Query: ${dbHealthData.latency_ms} ms` : "Verified connection"}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Database className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Connected Portals Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-emerald-400" />
                    Connected Job Portals & ATS Instances
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Active integrations syncing candidate and job application pipelines.
                  </p>
                </div>
                <Button
                  onClick={loadIntegrations}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingIntegrations ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </Button>
              </div>

              {loadingIntegrations ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-muted-foreground">Loading connected integrations...</span>
                </div>
              ) : integrations.length === 0 ? (
                <Card variant="glass" className="border-dashed border-white/15 p-12 text-center">
                  <Plug className="w-12 h-12 text-emerald-400/60 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-foreground">No External Job Portals Connected</h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-6">
                    Connect Greenhouse, Lever, Ashby, Workable, or your custom enterprise ATS to automatically ingest and synchronize job applications.
                  </p>
                  <Button
                    onClick={() => setIsAddIntegrationOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-xs"
                  >
                    <Plug className="w-4 h-4" />
                    <span>Connect First Job Portal</span>
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {integrations.map((integ) => (
                    <Card key={integ.id} variant="glass" className="border-white/10 hover:border-emerald-500/30 transition-all">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold uppercase text-xs">
                              {integ.provider.slice(0, 2)}
                            </div>
                            <div>
                              <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <span>{integ.name}</span>
                                <Badge variant="outline" className="text-[10px] uppercase font-mono bg-white/5 border-white/10">
                                  {integ.provider}
                                </Badge>
                              </CardTitle>
                              <p className="text-xs text-muted-foreground mt-0.5 font-mono flex items-center gap-1.5">
                                <Lock className="w-3 h-3 text-emerald-400" />
                                <span>{integ.masked_api_key}</span>
                              </p>
                            </div>
                          </div>

                          <Badge
                            variant="outline"
                            className={`text-[10px] capitalize ${
                              integ.status === "active"
                                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                : "border-destructive/40 text-destructive bg-destructive/10"
                            }`}
                          >
                            {integ.status}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        {integ.api_base_url && (
                          <div className="text-[11px] font-mono text-muted-foreground truncate bg-white/5 p-2 rounded-lg border border-white/5">
                            Endpoint: {integ.api_base_url}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                          <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                            <span className="text-[10px] uppercase font-mono text-muted-foreground block">Imported Count</span>
                            <span className="text-sm font-bold text-foreground mt-0.5 block">
                              {integ.imported_count || 0} applications
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                            <span className="text-[10px] uppercase font-mono text-muted-foreground block">Last Synchronized</span>
                            <span className="text-xs text-foreground mt-0.5 block truncate">
                              {integ.last_sync_at ? new Date(integ.last_sync_at).toLocaleString() : "Never"}
                            </span>
                          </div>
                        </div>

                        {integ.last_error && (
                          <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px]">
                            {integ.last_error}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              disabled={syncingIntegrationId === integ.id}
                              onClick={() => handleSyncIntegration(integ.id, integ.name)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 gap-1.5"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${syncingIntegrationId === integ.id ? "animate-spin" : ""}`} />
                              <span>{syncingIntegrationId === integ.id ? "Syncing..." : "Sync Now"}</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={validatingIntegrationId === integ.id}
                              onClick={() => handleValidateIntegration(integ.id, integ.name)}
                              className="border-white/10 text-xs h-8 gap-1"
                            >
                              <CheckCircle2 className={`w-3.5 h-3.5 ${validatingIntegrationId === integ.id ? "animate-spin text-muted-foreground" : "text-emerald-400"}`} />
                              <span>Validate</span>
                            </Button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenSyncHistory(integ)}
                              className="text-xs h-8 text-muted-foreground hover:text-foreground gap-1"
                              title="Sync Logs"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>Logs</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={disconnectingIntegrationId === integ.id}
                              onClick={() => handleDisconnectIntegration(integ.id, integ.name)}
                              className="text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              title="Disconnect Integration"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Provider Compatibility & Partner Enterprise Notice */}
            <Card variant="glass" className="border-white/10 bg-gradient-to-r from-card via-card to-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Provider Compatibility & Compliance Standards
                </CardTitle>
                <CardDescription>
                  Official REST API integrations support direct credential authentication. Certain platforms require official partner verification.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground text-xs">Greenhouse Harvest</span>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Ready</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">HTTP Basic Auth. Direct ingestion of job candidates and applications.</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground text-xs">Lever ATS</span>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Ready</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">HTTP Basic Auth. Real-time extraction of opportunities and candidates.</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground text-xs">Ashby ATS</span>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Ready</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Ashby Secret API Key. Syncs job postings and application pipeline.</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground text-xs">Workable SPI v3</span>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Ready</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Subdomain + Bearer API token authentication for candidate pipeline.</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground text-xs">Custom REST ATS</span>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Ready</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Standard JSON payload support for bespoke internal recruitment systems.</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-300 text-xs">LinkedIn & Indeed</span>
                      <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/20 text-[10px]">Partner Notice</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Enterprise Partner Program required by LinkedIn & Indeed for direct API keys.</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>LinkedIn Talent Hub & Indeed Direct API Notice</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Direct private API key access for LinkedIn Talent Hub and Indeed Apply is strictly restricted by LinkedIn and Indeed to certified enterprise ATS software partners. To protect user accounts and prevent credential invalidation, AutoAgentHire utilizes automated browser-assisted job matching and verified CSV candidate exports rather than unauthorized private API scrapers.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Imported Job Applications Explorer */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-purple-400" />
                    Synchronized Job Applications
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Candidates and applications imported from active ATS integrations, deduplicated with SHA-256 signatures.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      placeholder="Search applications..."
                      value={appSearchQuery}
                      onChange={(e) => {
                        setAppSearchQuery(e.target.value);
                        loadImportedApplications(appProviderFilter, e.target.value);
                      }}
                      className="pl-8 text-xs h-9 w-48 lg:w-64"
                    />
                  </div>

                  <select
                    value={appProviderFilter}
                    onChange={(e) => {
                      setAppProviderFilter(e.target.value);
                      loadImportedApplications(e.target.value, appSearchQuery);
                    }}
                    className="h-9 rounded-lg border border-white/10 bg-card px-3 text-xs text-foreground"
                  >
                    <option value="all">All Providers</option>
                    <option value="greenhouse">Greenhouse</option>
                    <option value="lever">Lever</option>
                    <option value="ashby">Ashby</option>
                    <option value="workable">Workable</option>
                    <option value="generic_ats">Custom ATS</option>
                  </select>
                </div>
              </div>

              {loadingImportedApps ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-muted-foreground">Loading synchronized applications...</span>
                </div>
              ) : importedApplications.length === 0 ? (
                <Card variant="glass" className="p-8 text-center border-white/10">
                  <FileCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <h4 className="text-sm font-semibold text-foreground">No Imported Applications Found</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click "Sync Now" on a connected portal above to ingest candidate applications.
                  </p>
                </Card>
              ) : (
                <Card variant="glass" className="border-white/10 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/5 border-b border-white/10 text-muted-foreground uppercase font-mono text-[10px]">
                        <tr>
                          <th className="py-3 px-4">Candidate</th>
                          <th className="py-3 px-4">Job Title & Company</th>
                          <th className="py-3 px-4">Location</th>
                          <th className="py-3 px-4">Provider</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">External ID</th>
                          <th className="py-3 px-4">Imported At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {importedApplications.map((app) => (
                          <tr key={app.id} className="hover:bg-white/5 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-foreground">{app.candidate_name || "Applicant"}</div>
                              <div className="text-[11px] text-muted-foreground font-mono">{app.candidate_email || "—"}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-foreground">{app.job_title}</div>
                              <div className="text-[11px] text-muted-foreground">{app.company_name}</div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {app.job_location || "Remote / Unspecified"}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="outline" className="text-[10px] uppercase font-mono bg-white/5 border-white/10">
                                {app.provider}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant="outline"
                                className={`text-[10px] capitalize ${
                                  app.application_status === "hired" || app.application_status === "approved"
                                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                    : app.application_status === "rejected"
                                    ? "border-destructive/40 text-destructive bg-destructive/10"
                                    : "border-blue-500/40 text-blue-300 bg-blue-500/10"
                                }`}
                              >
                                {app.application_status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                              #{app.external_application_id}
                            </td>
                            <td className="py-3 px-4 text-[11px] text-muted-foreground">
                              {app.created_at ? new Date(app.created_at).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>

            {/* Database Health & Diagnostic Governance Card */}
            <Card variant="glass" className="border-purple-500/20 bg-gradient-to-r from-purple-950/20 via-card to-card">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="w-5 h-5 text-purple-400" />
                    System Database Health & Schema Audit
                  </CardTitle>
                  <CardDescription>
                    Live diagnostics restricted to authorizer credentials. Verifies table integrity, row counts, and query performance.
                  </CardDescription>
                </div>
                <Button
                  onClick={loadDatabaseHealth}
                  disabled={loadingDbHealth}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDbHealth ? "animate-spin" : ""}`} />
                  <span>Run Live Health Diagnostic</span>
                </Button>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {dbHealthError && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                    {dbHealthError}
                  </div>
                )}

                {dbHealthData && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-muted-foreground uppercase font-mono text-[10px] block">Status</span>
                        <span className="text-sm font-bold text-emerald-400 mt-0.5 block flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {dbHealthData.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-muted-foreground uppercase font-mono text-[10px] block">Database Engine</span>
                        <span className="text-sm font-bold text-foreground font-mono mt-0.5 block uppercase">
                          {dbHealthData.database_type}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-muted-foreground uppercase font-mono text-[10px] block">Query Latency</span>
                        <span className="text-sm font-bold text-purple-300 font-mono mt-0.5 block">
                          {dbHealthData.latency_ms} ms
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-muted-foreground uppercase font-mono text-[10px] block">Last Inspected</span>
                        <span className="text-xs text-foreground font-mono mt-0.5 block">
                          {lastDbHealthCheckedAt || "Just now"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase font-mono block">
                        Core Table Record Inventory
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {dbHealthData.tables && Object.entries(dbHealthData.tables).map(([tableName, info]: [string, any]) => (
                          <div key={tableName} className="p-2.5 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between text-xs">
                            <span className="font-mono text-muted-foreground truncate">{tableName}</span>
                            <span className="font-bold font-mono text-foreground">{info.record_count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* SECTION 5: PROFILE & SETTINGS */}
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
                {profileError && (
                  <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-between text-xs">
                    <span>{profileError}</span>
                    <Button size="sm" variant="outline" onClick={loadAuthorizerProfile} className="h-7 text-xs">
                      Retry
                    </Button>
                  </div>
                )}

                {loadingProfile ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground">Retrieving verified authorizer credentials...</span>
                  </div>
                ) : (
                  <>
                    {/* 1. Photo Section */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-4 rounded-2xl bg-white/5 border border-white/10">
                      <div className="relative">
                        {currentUser?.avatar_url ? (
                          <img
                            src={currentUser.avatar_url}
                            alt={currentUser?.full_name || "Authorizer"}
                            className="w-24 h-24 rounded-2xl object-cover border-2 border-purple-500/40 shadow-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop";
                            }}
                          />
                        ) : (
                          <div className="w-24 h-24 rounded-2xl bg-purple-500/20 border-2 border-purple-500/40 flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                            {getInitials(currentUser?.full_name, currentUser?.email)}
                          </div>
                        )}
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
                            {currentUser?.full_name || currentUser?.email || "Authorized User"}
                          </h3>
                          <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/30 text-xs">
                            Authorizer & System Admin
                          </Badge>
                        </div>
                        <p className="text-sm font-semibold text-purple-400">
                          {currentUser?.job_role || "Platform Governance Authorizer"}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-1">
                          <Building2 className="w-3.5 h-3.5" />
                          <span>{currentUser?.company_name || "—"}</span>
                          &bull;
                          <MapPin className="w-3.5 h-3.5 ml-1" />
                          <span>{currentUser?.location || "—"}</span>
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
                          {currentUser?.full_name || "Not specified"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-400" />
                          Mobile Number
                        </span>
                        <span className="text-sm font-semibold text-foreground font-mono block">
                          {currentUser?.phone || "Not configured"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                          <Mail className="w-3 h-3 text-purple-400" />
                          Email Address
                        </span>
                        <span className="text-sm font-medium text-foreground truncate block">
                          {currentUser?.email || "—"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                        <span className="text-purple-300 block uppercase font-mono text-[10px] flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" />
                          Education (College / University)
                        </span>
                        <span className="text-sm font-semibold text-foreground block">
                          {currentUser?.education || "Not specified"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                        <span className="text-purple-300 block uppercase font-mono text-[10px] flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          Education Qualification
                        </span>
                        <span className="text-sm font-semibold text-foreground block">
                          {currentUser?.qualification || "Not specified"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-blue-400" />
                          Designation / Job Role
                        </span>
                        <span className="text-sm font-bold text-purple-300 block">
                          {currentUser?.job_role || "Platform Governance Authorizer"}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <span className="text-muted-foreground block uppercase font-mono text-[10px]">Authorizer ID</span>
                        <span className="text-sm font-bold text-purple-400 font-mono block">
                          {currentUser?.custom_user_id || (currentUser?.id ? `AUTH-${currentUser.id}` : "—")}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <span className="text-muted-foreground block uppercase font-mono text-[10px]">Permission Scope</span>
                        <span className="text-sm font-semibold text-emerald-400 block">
                          Full System & Recruiter Governance
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <span className="text-muted-foreground block uppercase font-mono text-[10px]">Database Governance</span>
                        <span className="text-sm font-mono text-purple-300 block flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5" />
                          Direct Inspection Access
                        </span>
                      </div>
                    </div>
                  </>
                )}
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


      {/* Import via Website URL Modal */}
      <Dialog open={isWebsiteImportOpen} onOpenChange={setIsWebsiteImportOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 text-foreground p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal-400" />
              Import Jobs from Careers Website URL
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter any public careers page URL (e.g. https://company.com/careers). The system automatically discovers Schema.org JobPostings and public ATS feeds with SSRF protection.
            </DialogDescription>
          </DialogHeader>

          {/* URL Input Form */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Careers Website URL *</Label>
                <div className="relative mt-1">
                  <Globe className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="https://company.com/careers or https://stripe.com/jobs"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="pl-9 text-xs font-mono"
                    disabled={isScanningWebsite || isImportingWebsite}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Connection Name (Optional)</Label>
                <Input
                  placeholder="e.g. Stripe Careers"
                  value={websiteConnectionName}
                  onChange={(e) => setWebsiteConnectionName(e.target.value)}
                  className="mt-1 text-xs"
                  disabled={isScanningWebsite || isImportingWebsite}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>Protected against SSRF, intranet probes, and rate-limiting.</span>
              </div>
              <Button
                type="button"
                onClick={handleScanWebsite}
                disabled={isScanningWebsite || isImportingWebsite || !websiteUrl.trim()}
                className="bg-teal-600 hover:bg-teal-500 text-white gap-2 text-xs shadow-md shadow-teal-600/20"
              >
                {isScanningWebsite ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Scanning Careers Website...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Scan Careers Website</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Scanning Animation State */}
          {isScanningWebsite && (
            <div className="py-10 text-center space-y-3 bg-muted/20 rounded-2xl border border-white/5 my-4">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
              <div>
                <h4 className="text-sm font-semibold text-foreground">Extracting Job Listings...</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verifying DNS safety, parsing Schema.org JSON-LD, and checking ATS board feeds.
                </p>
              </div>
            </div>
          )}

          {/* Discovered Jobs Preview Table */}
          {!isScanningWebsite && discoveredJobs.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-teal-500/10 border border-teal-500/20 p-3 rounded-xl text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold text-teal-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    <span>Discovered {discoveredJobs.length} Jobs ({scanResultMeta?.crawl_method || "Web Crawl"})</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {scanResultMeta?.new_jobs_count || 0} new listings, {scanResultMeta?.already_imported_count || 0} already in database.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAllJobs(selectedJobIds.size < discoveredJobs.length)}
                    className="text-xs h-7 border-teal-500/30 text-teal-300 hover:bg-teal-500/20"
                  >
                    {selectedJobIds.size === discoveredJobs.length ? "Deselect All" : `Select All (${discoveredJobs.length})`}
                  </Button>
                  <span className="text-[11px] font-mono font-bold text-foreground">
                    {selectedJobIds.size} Selected
                  </span>
                </div>
              </div>

              {/* Jobs Table */}
              <div className="max-h-72 overflow-y-auto border border-white/10 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground font-semibold sticky top-0 backdrop-blur-md">
                    <tr>
                      <th className="p-2.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={discoveredJobs.length > 0 && selectedJobIds.size === discoveredJobs.length}
                          onChange={(e) => handleSelectAllJobs(e.target.checked)}
                          className="rounded border-white/20 bg-background"
                        />
                      </th>
                      <th className="p-2.5">Title & Company</th>
                      <th className="p-2.5">Location & Type</th>
                      <th className="p-2.5">Salary</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {discoveredJobs.map((job) => {
                      const isSelected = selectedJobIds.has(job.temp_id);
                      return (
                        <tr
                          key={job.temp_id}
                          onClick={() => handleToggleSelectJob(job.temp_id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-teal-500/10" : "hover:bg-muted/20"
                          }`}
                        >
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectJob(job.temp_id)}
                              className="rounded border-white/20 bg-background"
                            />
                          </td>
                          <td className="p-2.5">
                            <div className="font-semibold text-foreground">{job.title}</div>
                            <div className="text-[11px] text-muted-foreground">{job.company_name}</div>
                          </td>
                          <td className="p-2.5">
                            <div className="text-foreground">{job.location || "Remote"}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {job.workplace_type}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {job.employment_type}
                              </span>
                            </div>
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {job.salary || "Competitive"}
                          </td>
                          <td className="p-2.5">
                            {job.is_already_imported ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                                In Database
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                New Job
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {job.job_posting_url && (
                              <a
                                href={job.job_posting_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-teal-400 hover:text-teal-300 p-1 inline-flex"
                                title="View original posting"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedJobIds.size} of {discoveredJobs.length} position{discoveredJobs.length === 1 ? "" : "s"} selected for import
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isImportingWebsite}
                    onClick={() => setIsWebsiteImportOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isImportingWebsite || selectedJobIds.size === 0}
                    onClick={handleImportSelectedWebsiteJobs}
                    className="bg-teal-600 hover:bg-teal-500 text-white gap-2 text-xs shadow-md shadow-teal-600/20"
                  >
                    {isImportingWebsite ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving to Database...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Selected Jobs ({selectedJobIds.size})</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Past Imports History Section */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-teal-400" />
                Website Import History
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadWebsiteImportHistory}
                disabled={loadingWebsiteHistory}
                className="text-[11px] h-6 px-2 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loadingWebsiteHistory ? "animate-spin" : ""}`} />
                Refresh History
              </Button>
            </div>

            {websiteImportHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                No previous website scans recorded. Enter a URL above to discover listings.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs">
                {websiteImportHistory.slice(0, 5).map((h) => (
                  <div
                    key={h.id}
                    className="p-2 rounded-lg bg-muted/20 border border-white/5 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-teal-400" />
                        <span>{h.name || h.url}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {h.last_sync_at ? new Date(h.last_sync_at).toLocaleString() : "Recently synced"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-teal-300 font-semibold">
                        {h.jobs_count || 0} Active Jobs
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        h.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
                      }`}>
                        {h.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                  <span className="font-mono text-purple-400">ID: {currentUser?.custom_user_id || (currentUser?.id ? `AUTH-${currentUser.id}` : "—")}</span>
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


      {/* Import via Website URL Modal */}
      <Dialog open={isWebsiteImportOpen} onOpenChange={setIsWebsiteImportOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 text-foreground p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal-400" />
              Import Jobs from Careers Website URL
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter any public careers page URL (e.g. https://company.com/careers). The system automatically discovers Schema.org JobPostings and public ATS feeds with SSRF protection.
            </DialogDescription>
          </DialogHeader>

          {/* URL Input Form */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Careers Website URL *</Label>
                <div className="relative mt-1">
                  <Globe className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="https://company.com/careers or https://stripe.com/jobs"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="pl-9 text-xs font-mono"
                    disabled={isScanningWebsite || isImportingWebsite}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Connection Name (Optional)</Label>
                <Input
                  placeholder="e.g. Stripe Careers"
                  value={websiteConnectionName}
                  onChange={(e) => setWebsiteConnectionName(e.target.value)}
                  className="mt-1 text-xs"
                  disabled={isScanningWebsite || isImportingWebsite}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>Protected against SSRF, intranet probes, and rate-limiting.</span>
              </div>
              <Button
                type="button"
                onClick={handleScanWebsite}
                disabled={isScanningWebsite || isImportingWebsite || !websiteUrl.trim()}
                className="bg-teal-600 hover:bg-teal-500 text-white gap-2 text-xs shadow-md shadow-teal-600/20"
              >
                {isScanningWebsite ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Scanning Careers Website...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Scan Careers Website</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Scanning Animation State */}
          {isScanningWebsite && (
            <div className="py-10 text-center space-y-3 bg-muted/20 rounded-2xl border border-white/5 my-4">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
              <div>
                <h4 className="text-sm font-semibold text-foreground">Extracting Job Listings...</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verifying DNS safety, parsing Schema.org JSON-LD, and checking ATS board feeds.
                </p>
              </div>
            </div>
          )}

          {/* Discovered Jobs Preview Table */}
          {!isScanningWebsite && discoveredJobs.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-teal-500/10 border border-teal-500/20 p-3 rounded-xl text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold text-teal-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    <span>Discovered {discoveredJobs.length} Jobs ({scanResultMeta?.crawl_method || "Web Crawl"})</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {scanResultMeta?.new_jobs_count || 0} new listings, {scanResultMeta?.already_imported_count || 0} already in database.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAllJobs(selectedJobIds.size < discoveredJobs.length)}
                    className="text-xs h-7 border-teal-500/30 text-teal-300 hover:bg-teal-500/20"
                  >
                    {selectedJobIds.size === discoveredJobs.length ? "Deselect All" : `Select All (${discoveredJobs.length})`}
                  </Button>
                  <span className="text-[11px] font-mono font-bold text-foreground">
                    {selectedJobIds.size} Selected
                  </span>
                </div>
              </div>

              {/* Jobs Table */}
              <div className="max-h-72 overflow-y-auto border border-white/10 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground font-semibold sticky top-0 backdrop-blur-md">
                    <tr>
                      <th className="p-2.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={discoveredJobs.length > 0 && selectedJobIds.size === discoveredJobs.length}
                          onChange={(e) => handleSelectAllJobs(e.target.checked)}
                          className="rounded border-white/20 bg-background"
                        />
                      </th>
                      <th className="p-2.5">Title & Company</th>
                      <th className="p-2.5">Location & Type</th>
                      <th className="p-2.5">Salary</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {discoveredJobs.map((job) => {
                      const isSelected = selectedJobIds.has(job.temp_id);
                      return (
                        <tr
                          key={job.temp_id}
                          onClick={() => handleToggleSelectJob(job.temp_id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-teal-500/10" : "hover:bg-muted/20"
                          }`}
                        >
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectJob(job.temp_id)}
                              className="rounded border-white/20 bg-background"
                            />
                          </td>
                          <td className="p-2.5">
                            <div className="font-semibold text-foreground">{job.title}</div>
                            <div className="text-[11px] text-muted-foreground">{job.company_name}</div>
                          </td>
                          <td className="p-2.5">
                            <div className="text-foreground">{job.location || "Remote"}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {job.workplace_type}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {job.employment_type}
                              </span>
                            </div>
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {job.salary || "Competitive"}
                          </td>
                          <td className="p-2.5">
                            {job.is_already_imported ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                                In Database
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                New Job
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {job.job_posting_url && (
                              <a
                                href={job.job_posting_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-teal-400 hover:text-teal-300 p-1 inline-flex"
                                title="View original posting"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedJobIds.size} of {discoveredJobs.length} position{discoveredJobs.length === 1 ? "" : "s"} selected for import
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isImportingWebsite}
                    onClick={() => setIsWebsiteImportOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isImportingWebsite || selectedJobIds.size === 0}
                    onClick={handleImportSelectedWebsiteJobs}
                    className="bg-teal-600 hover:bg-teal-500 text-white gap-2 text-xs shadow-md shadow-teal-600/20"
                  >
                    {isImportingWebsite ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving to Database...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Selected Jobs ({selectedJobIds.size})</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Past Imports History Section */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-teal-400" />
                Website Import History
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadWebsiteImportHistory}
                disabled={loadingWebsiteHistory}
                className="text-[11px] h-6 px-2 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loadingWebsiteHistory ? "animate-spin" : ""}`} />
                Refresh History
              </Button>
            </div>

            {websiteImportHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                No previous website scans recorded. Enter a URL above to discover listings.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs">
                {websiteImportHistory.slice(0, 5).map((h) => (
                  <div
                    key={h.id}
                    className="p-2 rounded-lg bg-muted/20 border border-white/5 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-teal-400" />
                        <span>{h.name || h.url}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {h.last_sync_at ? new Date(h.last_sync_at).toLocaleString() : "Recently synced"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-teal-300 font-semibold">
                        {h.jobs_count || 0} Active Jobs
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        h.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
                      }`}>
                        {h.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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


      {/* Import via Website URL Modal */}
      <Dialog open={isWebsiteImportOpen} onOpenChange={setIsWebsiteImportOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 text-foreground p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal-400" />
              Import Jobs from Careers Website URL
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter any public careers page URL (e.g. https://company.com/careers). The system automatically discovers Schema.org JobPostings and public ATS feeds with SSRF protection.
            </DialogDescription>
          </DialogHeader>

          {/* URL Input Form */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Careers Website URL *</Label>
                <div className="relative mt-1">
                  <Globe className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="https://company.com/careers or https://stripe.com/jobs"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="pl-9 text-xs font-mono"
                    disabled={isScanningWebsite || isImportingWebsite}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Connection Name (Optional)</Label>
                <Input
                  placeholder="e.g. Stripe Careers"
                  value={websiteConnectionName}
                  onChange={(e) => setWebsiteConnectionName(e.target.value)}
                  className="mt-1 text-xs"
                  disabled={isScanningWebsite || isImportingWebsite}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>Protected against SSRF, intranet probes, and rate-limiting.</span>
              </div>
              <Button
                type="button"
                onClick={handleScanWebsite}
                disabled={isScanningWebsite || isImportingWebsite || !websiteUrl.trim()}
                className="bg-teal-600 hover:bg-teal-500 text-white gap-2 text-xs shadow-md shadow-teal-600/20"
              >
                {isScanningWebsite ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Scanning Careers Website...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Scan Careers Website</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Scanning Animation State */}
          {isScanningWebsite && (
            <div className="py-10 text-center space-y-3 bg-muted/20 rounded-2xl border border-white/5 my-4">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
              <div>
                <h4 className="text-sm font-semibold text-foreground">Extracting Job Listings...</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verifying DNS safety, parsing Schema.org JSON-LD, and checking ATS board feeds.
                </p>
              </div>
            </div>
          )}

          {/* Discovered Jobs Preview Table */}
          {!isScanningWebsite && discoveredJobs.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-teal-500/10 border border-teal-500/20 p-3 rounded-xl text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold text-teal-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    <span>Discovered {discoveredJobs.length} Jobs ({scanResultMeta?.crawl_method || "Web Crawl"})</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {scanResultMeta?.new_jobs_count || 0} new listings, {scanResultMeta?.already_imported_count || 0} already in database.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAllJobs(selectedJobIds.size < discoveredJobs.length)}
                    className="text-xs h-7 border-teal-500/30 text-teal-300 hover:bg-teal-500/20"
                  >
                    {selectedJobIds.size === discoveredJobs.length ? "Deselect All" : `Select All (${discoveredJobs.length})`}
                  </Button>
                  <span className="text-[11px] font-mono font-bold text-foreground">
                    {selectedJobIds.size} Selected
                  </span>
                </div>
              </div>

              {/* Jobs Table */}
              <div className="max-h-72 overflow-y-auto border border-white/10 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground font-semibold sticky top-0 backdrop-blur-md">
                    <tr>
                      <th className="p-2.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={discoveredJobs.length > 0 && selectedJobIds.size === discoveredJobs.length}
                          onChange={(e) => handleSelectAllJobs(e.target.checked)}
                          className="rounded border-white/20 bg-background"
                        />
                      </th>
                      <th className="p-2.5">Title & Company</th>
                      <th className="p-2.5">Location & Type</th>
                      <th className="p-2.5">Salary</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {discoveredJobs.map((job) => {
                      const isSelected = selectedJobIds.has(job.temp_id);
                      return (
                        <tr
                          key={job.temp_id}
                          onClick={() => handleToggleSelectJob(job.temp_id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-teal-500/10" : "hover:bg-muted/20"
                          }`}
                        >
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectJob(job.temp_id)}
                              className="rounded border-white/20 bg-background"
                            />
                          </td>
                          <td className="p-2.5">
                            <div className="font-semibold text-foreground">{job.title}</div>
                            <div className="text-[11px] text-muted-foreground">{job.company_name}</div>
                          </td>
                          <td className="p-2.5">
                            <div className="text-foreground">{job.location || "Remote"}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {job.workplace_type}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {job.employment_type}
                              </span>
                            </div>
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {job.salary || "Competitive"}
                          </td>
                          <td className="p-2.5">
                            {job.is_already_imported ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                                In Database
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                New Job
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {job.job_posting_url && (
                              <a
                                href={job.job_posting_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-teal-400 hover:text-teal-300 p-1 inline-flex"
                                title="View original posting"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedJobIds.size} of {discoveredJobs.length} position{discoveredJobs.length === 1 ? "" : "s"} selected for import
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isImportingWebsite}
                    onClick={() => setIsWebsiteImportOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isImportingWebsite || selectedJobIds.size === 0}
                    onClick={handleImportSelectedWebsiteJobs}
                    className="bg-teal-600 hover:bg-teal-500 text-white gap-2 text-xs shadow-md shadow-teal-600/20"
                  >
                    {isImportingWebsite ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving to Database...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Selected Jobs ({selectedJobIds.size})</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Past Imports History Section */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-teal-400" />
                Website Import History
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadWebsiteImportHistory}
                disabled={loadingWebsiteHistory}
                className="text-[11px] h-6 px-2 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loadingWebsiteHistory ? "animate-spin" : ""}`} />
                Refresh History
              </Button>
            </div>

            {websiteImportHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                No previous website scans recorded. Enter a URL above to discover listings.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs">
                {websiteImportHistory.slice(0, 5).map((h) => (
                  <div
                    key={h.id}
                    className="p-2 rounded-lg bg-muted/20 border border-white/5 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-teal-400" />
                        <span>{h.name || h.url}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {h.last_sync_at ? new Date(h.last_sync_at).toLocaleString() : "Recently synced"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-teal-300 font-semibold">
                        {h.jobs_count || 0} Active Jobs
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        h.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
                      }`}>
                        {h.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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

      {/* Connect Job Portal / ATS Modal */}
      <Dialog open={isAddIntegrationOpen} onOpenChange={setIsAddIntegrationOpen}>
        <DialogContent className="max-w-lg bg-card/95 backdrop-blur-2xl border-white/10 text-foreground p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Plug className="w-5 h-5 text-emerald-400" />
              Connect Job Portal or ATS
            </DialogTitle>
            <DialogDescription className="text-xs">
              Credentials are encrypted using AES-256 (Fernet) and only decrypted during synchronized API calls.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateIntegration} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Select Provider</Label>
              <select
                value={addIntegrationForm.provider}
                onChange={(e) => {
                  const p = e.target.value;
                  setAddIntegrationForm({
                    ...addIntegrationForm,
                    provider: p,
                    name: addIntegrationForm.name || (p === "greenhouse" ? "Greenhouse Production" : p === "lever" ? "Lever ATS" : p === "ashby" ? "Ashby Production" : p === "workable" ? "Workable Pipeline" : "Custom ATS Pipeline"),
                  });
                }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="greenhouse">Greenhouse Harvest API</option>
                <option value="lever">Lever ATS API</option>
                <option value="ashby">Ashby ATS API</option>
                <option value="workable">Workable SPI v3</option>
                <option value="generic_ats">Custom Enterprise REST ATS</option>
              </select>
            </div>

            {addIntegrationForm.provider === "greenhouse" && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-muted-foreground">
                <span className="font-semibold text-emerald-300 block mb-0.5">Greenhouse Configuration:</span>
                Create a Harvest API key in Greenhouse Configure &gt; Dev Center &gt; API Credential Management with read permissions for Candidates and Applications.
              </div>
            )}

            {addIntegrationForm.provider === "lever" && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-muted-foreground">
                <span className="font-semibold text-emerald-300 block mb-0.5">Lever Configuration:</span>
                Generate an API key in Lever Settings &gt; Integrations &amp; API &gt; Partner API. Read permissions for Postings and Opportunities are required.
              </div>
            )}

            {addIntegrationForm.provider === "ashby" && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-muted-foreground">
                <span className="font-semibold text-emerald-300 block mb-0.5">Ashby Configuration:</span>
                Create an API secret key in Ashby Admin &gt; Ashby API. Read permissions for Job Postings and Applications are required.
              </div>
            )}

            {addIntegrationForm.provider === "workable" && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-emerald-300 block mb-0.5">Workable Configuration:</span>
                  Enter your company's Workable subdomain (e.g. "acme" for https://acme.workable.com) and your Workable API Access Token.
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Workable Subdomain *</Label>
                  <Input
                    placeholder="e.g. acme-corp"
                    value={subdomainInput}
                    onChange={(e) => setSubdomainInput(e.target.value)}
                    className="mt-1 text-xs"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Connection Display Name *</Label>
              <Input
                placeholder="e.g. Primary Production ATS"
                value={addIntegrationForm.name}
                onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, name: e.target.value })}
                className="mt-1 text-xs"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">API Key / Access Token / Secret *</Label>
              <Input
                type="password"
                placeholder="Paste API credential key..."
                value={addIntegrationForm.api_key}
                onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, api_key: e.target.value })}
                className="mt-1 text-xs font-mono"
                required
              />
              <span className="text-[10px] text-muted-foreground mt-0.5 block flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-400" />
                Encrypted with AES-256 Fernet before writing to database.
              </span>
            </div>

            {addIntegrationForm.provider === "generic_ats" && (
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground">API Base Endpoint URL *</Label>
                <Input
                  placeholder="https://ats.yourcompany.com/api/v1"
                  value={addIntegrationForm.api_base_url}
                  onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, api_base_url: e.target.value })}
                  className="mt-1 text-xs font-mono"
                  required
                />
              </div>
            )}

            <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={creatingIntegration}
                onClick={() => setIsAddIntegrationOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingIntegration}
                className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-xs"
              >
                {creatingIntegration ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Validating &amp; Connecting...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Validate &amp; Save Connection</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import via Website URL Modal */}
      <Dialog open={isWebsiteImportOpen} onOpenChange={setIsWebsiteImportOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 text-foreground p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal-400" />
              Import Jobs from Careers Website URL
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter any public careers page URL (e.g. https://company.com/careers). The system automatically discovers Schema.org JobPostings and public ATS feeds with SSRF protection.
            </DialogDescription>
          </DialogHeader>

          {/* URL Input Form */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Careers Website URL *</Label>
                <div className="relative mt-1">
                  <Globe className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="https://company.com/careers or https://stripe.com/jobs"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="pl-9 text-xs font-mono"
                    disabled={isScanningWebsite || isImportingWebsite}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Connection Name (Optional)</Label>
                <Input
                  placeholder="e.g. Stripe Careers"
                  value={websiteConnectionName}
                  onChange={(e) => setWebsiteConnectionName(e.target.value)}
                  className="mt-1 text-xs"
                  disabled={isScanningWebsite || isImportingWebsite}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>Protected against SSRF, intranet probes, and rate-limiting.</span>
              </div>
              <Button
                type="button"
                onClick={handleScanWebsite}
                disabled={isScanningWebsite || isImportingWebsite || !websiteUrl.trim()}
                className="bg-teal-600 hover:bg-teal-500 text-white gap-2 text-xs shadow-md shadow-teal-600/20"
              >
                {isScanningWebsite ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Scanning Careers Website...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Scan Careers Website</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Scanning Animation State */}
          {isScanningWebsite && (
            <div className="py-10 text-center space-y-3 bg-muted/20 rounded-2xl border border-white/5 my-4">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
              <div>
                <h4 className="text-sm font-semibold text-foreground">Extracting Job Listings...</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verifying DNS safety, parsing Schema.org JSON-LD, and checking ATS board feeds.
                </p>
              </div>
            </div>
          )}

          {/* Discovered Jobs Preview Table */}
          {!isScanningWebsite && discoveredJobs.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-teal-500/10 border border-teal-500/20 p-3 rounded-xl text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold text-teal-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    <span>Discovered {discoveredJobs.length} Jobs ({scanResultMeta?.crawl_method || "Web Crawl"})</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {scanResultMeta?.new_jobs_count || 0} new listings, {scanResultMeta?.already_imported_count || 0} already in database.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAllJobs(selectedJobIds.size < discoveredJobs.length)}
                    className="text-xs h-7 border-teal-500/30 text-teal-300 hover:bg-teal-500/20"
                  >
                    {selectedJobIds.size === discoveredJobs.length ? "Deselect All" : `Select All (${discoveredJobs.length})`}
                  </Button>
                  <span className="text-[11px] font-mono font-bold text-foreground">
                    {selectedJobIds.size} Selected
                  </span>
                </div>
              </div>

              {/* Jobs Table */}
              <div className="max-h-72 overflow-y-auto border border-white/10 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground font-semibold sticky top-0 backdrop-blur-md">
                    <tr>
                      <th className="p-2.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={discoveredJobs.length > 0 && selectedJobIds.size === discoveredJobs.length}
                          onChange={(e) => handleSelectAllJobs(e.target.checked)}
                          className="rounded border-white/20 bg-background"
                        />
                      </th>
                      <th className="p-2.5">Title & Company</th>
                      <th className="p-2.5">Location & Type</th>
                      <th className="p-2.5">Salary</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {discoveredJobs.map((job) => {
                      const isSelected = selectedJobIds.has(job.temp_id);
                      return (
                        <tr
                          key={job.temp_id}
                          onClick={() => handleToggleSelectJob(job.temp_id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-teal-500/10" : "hover:bg-muted/20"
                          }`}
                        >
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectJob(job.temp_id)}
                              className="rounded border-white/20 bg-background"
                            />
                          </td>
                          <td className="p-2.5">
                            <div className="font-semibold text-foreground">{job.title}</div>
                            <div className="text-[11px] text-muted-foreground">{job.company_name}</div>
                          </td>
                          <td className="p-2.5">
                            <div className="text-foreground">{job.location || "Remote"}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {job.workplace_type}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {job.employment_type}
                              </span>
                            </div>
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {job.salary || "Competitive"}
                          </td>
                          <td className="p-2.5">
                            {job.is_already_imported ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                                In Database
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                New Job
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {job.job_posting_url && (
                              <a
                                href={job.job_posting_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-teal-400 hover:text-teal-300 p-1 inline-flex"
                                title="View original posting"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedJobIds.size} of {discoveredJobs.length} position{discoveredJobs.length === 1 ? "" : "s"} selected for import
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isImportingWebsite}
                    onClick={() => setIsWebsiteImportOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isImportingWebsite || selectedJobIds.size === 0}
                    onClick={handleImportSelectedWebsiteJobs}
                    className="bg-teal-600 hover:bg-teal-500 text-white gap-2 text-xs shadow-md shadow-teal-600/20"
                  >
                    {isImportingWebsite ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving to Database...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Selected Jobs ({selectedJobIds.size})</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Past Imports History Section */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-teal-400" />
                Website Import History
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadWebsiteImportHistory}
                disabled={loadingWebsiteHistory}
                className="text-[11px] h-6 px-2 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loadingWebsiteHistory ? "animate-spin" : ""}`} />
                Refresh History
              </Button>
            </div>

            {websiteImportHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                No previous website scans recorded. Enter a URL above to discover listings.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs">
                {websiteImportHistory.slice(0, 5).map((h) => (
                  <div
                    key={h.id}
                    className="p-2 rounded-lg bg-muted/20 border border-white/5 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-teal-400" />
                        <span>{h.name || h.url}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {h.last_sync_at ? new Date(h.last_sync_at).toLocaleString() : "Recently synced"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-teal-300 font-semibold">
                        {h.jobs_count || 0} Active Jobs
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        h.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
                      }`}>
                        {h.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sync History Logs Modal */}
      <Dialog open={isSyncHistoryOpen} onOpenChange={setIsSyncHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-card border-white/10 text-foreground p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              Synchronization Logs: {selectedIntegrationForHistory?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Audit log of all background and on-demand synchronization runs for this connection.
            </DialogDescription>
          </DialogHeader>

          {loadingSyncHistory ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="text-xs text-muted-foreground">Loading sync history...</span>
            </div>
          ) : syncHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No synchronization events recorded yet for this integration.
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {syncHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${
                        item.status === "completed"
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : "border-destructive/40 text-destructive bg-destructive/10"
                      }`}
                    >
                      {item.status}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {new Date(item.synced_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                    <div>
                      <span className="text-muted-foreground">Imported: </span>
                      <span className="text-emerald-400 font-bold">{item.records_imported}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Updated: </span>
                      <span className="text-purple-300 font-bold">{item.records_updated}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Failed: </span>
                      <span className="text-destructive font-bold">{item.records_failed}</span>
                    </div>
                  </div>

                  {item.error_message && (
                    <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px]">
                      {item.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-white/10 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSyncHistoryOpen(false)}
              className="text-xs"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
