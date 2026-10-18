import { useState, useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, LayoutDashboard, FileText, Search, Briefcase, Settings, HelpCircle,
  LogOut, Menu, X, Bell, ChevronDown, User, Star, Play, CheckCircle2,
  Sparkles, ExternalLink, ShieldCheck, Check, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { authService } from "@/services/authService";

const sidebarLinks = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Browse Jobs", href: "/candidate/jobs", icon: Search },
  { name: "Applications", href: "/dashboard/applications", icon: Briefcase },
  { name: "Job Automation", href: "/dashboard/automation", icon: Play },
  { name: "Resume Parser", href: "/dashboard/resume", icon: FileText },
  { name: "Profile", href: "/dashboard/profile", icon: User },
];

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: "job" | "ats" | "application" | "system";
  actionHref?: string;
}

const defaultNotifications: NotificationItem[] = [
  {
    id: "notif-1",
    title: "New Verified Job Match",
    message: "A new Full Stack Engineer position matching your skillset was published.",
    time: "15m ago",
    read: false,
    type: "job",
    actionHref: "/candidate/jobs",
  },
  {
    id: "notif-2",
    title: "Candidate Profile Verified",
    message: "Your profile details and credentials are live on the candidate portal.",
    time: "1h ago",
    read: false,
    type: "system",
    actionHref: "/dashboard/profile",
  },
  {
    id: "notif-3",
    title: "Application Tracked",
    message: "Your candidate profile and documents were updated in the tracking database.",
    time: "3h ago",
    read: false,
    type: "application",
    actionHref: "/dashboard/applications",
  },
  {
    id: "notif-4",
    title: "AI Job Agent Ready",
    message: "Candidate search agent is ready to automate verified job submissions.",
    time: "Yesterday",
    read: true,
    type: "system",
    actionHref: "/dashboard/automation",
  },
];

export const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(defaultNotifications);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const location = useLocation();
  const navigate = useNavigate();

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Fetch current user details
  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      // Fetch active user profile from backend
      try {
        const resp = await apiClient.get(API_ENDPOINTS.auth.me);
        if (resp.data && isMounted) {
          setCurrentUser((prev: any) => ({
            ...prev,
            ...resp.data,
          }));
        }
      } catch (err) {
        if (isMounted) {
          setCurrentUser((prev: any) => {
            if (prev?.email) return prev;
            const role = localStorage.getItem("userRole") || "candidate";
            return {
              full_name: "Candidate User",
              email: "candidate@autoagenthire.com",
              role,
            };
          });
        }
      }
    };

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  // Real-time notifications for newly uploaded job posts
  useEffect(() => {
    let isMounted = true;
    const loadJobNotifications = async () => {
      try {
        const resp = await apiClient.get(API_ENDPOINTS.recruiter.candidateJobs);
        const jobs = resp.data || [];
        if (Array.isArray(jobs) && jobs.length > 0 && isMounted) {
          const jobNotifs: NotificationItem[] = jobs.slice(0, 5).map((job: any, idx: number) => ({
            id: `job-post-notif-${job.id || idx}`,
            title: `New Job Opportunity: ${job.title}`,
            message: `${job.company_name} uploaded a verified job opening (${job.vacancies || 1} vacancy - ${job.job_type || 'Full-time'} in ${job.location || 'Remote'}). Tap to explore & apply.`,
            time: "New",
            read: false,
            type: "job",
            actionHref: "/candidate/jobs",
          }));

          setNotifications(prev => {
            const incomingIds = new Set(jobNotifs.map(j => j.id));
            const retained = prev.filter(p => !incomingIds.has(p.id) && p.id !== "notif-1");
            return [...jobNotifs, ...retained];
          });
        }
      } catch (err) {
        console.warn("Could not fetch active job postings for client notifications:", err);
      }
    };

    loadJobNotifications();

    const handleJobUpdate = () => {
      loadJobNotifications();
    };
    window.addEventListener("jobPostingsUpdated", handleJobUpdate);
    window.addEventListener("applicationSubmitted", handleJobUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener("jobPostingsUpdated", handleJobUpdate);
      window.removeEventListener("applicationSubmitted", handleJobUpdate);
    };
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await authService.signOut();
    navigate("/login");
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const markSingleAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const getUserInitials = () => {
    if (currentUser?.full_name) {
      const parts = currentUser.full_name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (currentUser?.email) {
      return currentUser.email.slice(0, 2).toUpperCase();
    }
    return "CA";
  };

  const getPageTitle = () => {
    if (location.pathname === "/candidate/jobs" || location.pathname === "/dashboard/jobs") {
      return "Browse Jobs";
    }
    const match = sidebarLinks.find((l) => l.href === location.pathname);
    return match?.name || "Candidate Dashboard";
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Desktop */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-40 bg-card/90 backdrop-blur-xl border-r border-white/5 transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/20">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col">
                <span className="text-base font-bold tracking-tight">AutoAgentHire</span>
                <span className="text-[10px] text-primary font-medium tracking-wide">Candidate Portal</span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {sidebarLinks.map((link) => {
            const isActive =
              location.pathname === link.href ||
              (link.href === "/candidate/jobs" && (location.pathname === "/candidate/jobs" || location.pathname === "/dashboard/jobs"));

            return (
              <Link
                key={link.name}
                to={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <link.icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="font-medium text-sm">{link.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User Card on Bottom of Sidebar */}
        {sidebarOpen && currentUser && (
          <div className="p-3 mx-3 mb-2 rounded-xl bg-white/5 border border-white/5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {getUserInitials()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate text-foreground">
                {currentUser.full_name || currentUser.email?.split("@")[0] || "Candidate"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{currentUser.email || "Candidate Active"}</p>
            </div>
          </div>
        )}

        {/* Logout */}
        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all text-left"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium text-sm">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              className="fixed inset-y-0 left-0 w-64 bg-card z-50 lg:hidden border-r border-white/5 flex flex-col"
            >
              <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
                <Link to="/dashboard" className="flex items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-md">
                    <Bot className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <span className="text-base font-bold">AutoAgentHire</span>
                    <span className="text-[10px] text-primary block">Candidate Portal</span>
                  </div>
                </Link>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="p-4 space-y-1.5 flex-1 overflow-y-auto">
                {sidebarLinks.map((link) => {
                  const isActive =
                    location.pathname === link.href ||
                    (link.href === "/candidate/jobs" && (location.pathname === "/candidate/jobs" || location.pathname === "/dashboard/jobs"));

                  return (
                    <Link
                      key={link.name}
                      to={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-white/5"
                      }`}
                    >
                      <link.icon className="w-5 h-5" />
                      <span className="font-medium text-sm">{link.name}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-white/5 mt-auto">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                >
                  <LogOut className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium text-sm">Logout</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content wrapper */}
      <div className={`flex-1 flex flex-col ${sidebarOpen ? "lg:ml-64" : "lg:ml-20"} transition-all duration-300 min-w-0`}>
        {/* Top header */}
        <header className="h-16 bg-card/60 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-muted-foreground"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                {getPageTitle()}
              </h1>
              <Badge variant="outline" className="hidden sm:inline-flex text-[11px] border-primary/30 text-primary bg-primary/5">
                Client Portal
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ACTIVATED NOTIFICATION BUTTON & DROPDOWN                      */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => {
                  setNotificationsOpen(!notificationsOpen);
                  setProfileOpen(false);
                }}
                className={`relative p-2.5 rounded-xl transition-all border ${
                  notificationsOpen
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "hover:bg-white/5 border-white/5 text-muted-foreground hover:text-foreground"
                }`}
                title="Notifications"
                aria-label="View notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse shadow-sm">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-card border border-white/10 shadow-2xl z-50 overflow-hidden"
                  >
                    {/* Header */}
                    <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-white/5">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-sm">Notifications</span>
                        {unreadCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] bg-primary/20 text-primary">
                            {unreadCount} new
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-[11px] text-primary hover:underline font-medium px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                          >
                            Mark all read
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={clearAllNotifications}
                            className="text-[11px] text-muted-foreground hover:text-destructive px-1.5 py-1 rounded hover:bg-white/5 transition-colors"
                            title="Clear all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                      {notifications.length > 0 ? (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            onClick={() => {
                              markSingleAsRead(notif.id);
                              if (notif.actionHref) {
                                navigate(notif.actionHref);
                                setNotificationsOpen(false);
                              }
                            }}
                            className={`p-3.5 flex items-start gap-3 hover:bg-white/5 cursor-pointer transition-colors ${
                              !notif.read ? "bg-primary/5" : ""
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              notif.type === "job" ? "bg-blue-500/10 text-blue-400" :
                              notif.type === "ats" ? "bg-purple-500/10 text-purple-400" :
                              notif.type === "application" ? "bg-emerald-500/10 text-emerald-400" :
                              "bg-amber-500/10 text-amber-400"
                            }`}>
                              {notif.type === "job" ? <Briefcase className="w-4 h-4" /> :
                               notif.type === "ats" ? <Sparkles className="w-4 h-4" /> :
                               notif.type === "application" ? <CheckCircle2 className="w-4 h-4" /> :
                               <Bot className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-xs font-semibold truncate ${!notif.read ? "text-foreground" : "text-muted-foreground"}`}>
                                  {notif.title}
                                </p>
                                <span className="text-[10px] text-muted-foreground flex-shrink-0">{notif.time}</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                                {notif.message}
                              </p>
                            </div>
                            {!notif.read && (
                              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 self-center" />
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-muted-foreground space-y-2">
                          <Check className="w-8 h-8 mx-auto text-muted-foreground/50" />
                          <p className="text-xs">All caught up! No notifications.</p>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-2 border-t border-white/10 bg-white/5 text-center">
                      <Link
                        to="/candidate/jobs"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        <span>Explore verified opportunities</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ACTIVATED PROFILE BUTTON & DROPDOWN                            */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="relative" ref={profileRef}>
              <div
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setNotificationsOpen(false);
                }}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  profileOpen
                    ? "bg-white/10 border-primary/40 text-foreground"
                    : "hover:bg-white/5 border-white/5 text-muted-foreground hover:text-foreground"
                }`}
                title="Account Menu"
              >
                {currentUser?.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.full_name || "Profile"}
                    className="w-8 h-8 rounded-lg object-cover border border-primary/30 shadow-md shadow-primary/25"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center text-primary-foreground text-xs font-bold shadow-md shadow-primary/25">
                    {getUserInitials()}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <span className="text-xs font-semibold block text-foreground leading-tight">
                    {currentUser?.full_name?.split(" ")[0] || currentUser?.email?.split("@")[0] || "Candidate"}
                  </span>
                  <span className="text-[10px] text-muted-foreground block leading-tight">Active</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${profileOpen ? "rotate-180 text-primary" : ""}`} />
              </div>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-64 rounded-2xl bg-card border border-white/10 shadow-2xl z-50 overflow-hidden"
                  >
                    {/* User Info Header */}
                    <div className="p-4 border-b border-white/10 bg-white/5">
                      <div className="flex items-center gap-3">
                        {currentUser?.avatar_url ? (
                          <img
                            src={currentUser.avatar_url}
                            alt={currentUser.full_name || "Profile"}
                            className="w-10 h-10 rounded-xl object-cover border border-primary/30 shadow-md"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center text-primary-foreground font-bold shadow-md">
                            {getUserInitials()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate text-foreground">
                            {currentUser?.full_name || "Candidate User"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {currentUser?.email || "candidate@autoagenthire.com"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          Candidate Verified
                        </Badge>
                      </div>
                    </div>

                    {/* Nav Actions */}
                    <div className="p-2 space-y-1">
                      <Link
                        to="/dashboard/profile"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        <User className="w-4 h-4 text-primary" />
                        <span>My Profile (Edit Details)</span>
                      </Link>
                      <Link
                        to="/dashboard/resume"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-primary" />
                        <span>My Resume & Profile</span>
                      </Link>

                      <Link
                        to="/candidate/jobs"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                      >
                        <Briefcase className="w-4 h-4 text-blue-400" />
                        <span>Browse Verified Jobs</span>
                      </Link>

                      <Link
                        to="/dashboard/applications"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Application Tracking</span>
                      </Link>

                      <Link
                        to="/dashboard/settings"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                      >
                        <Settings className="w-4 h-4 text-muted-foreground" />
                        <span>Account & Security Settings</span>
                      </Link>
                    </div>

                    {/* Sign Out */}
                    <div className="p-2 border-t border-white/10 bg-white/5">
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
