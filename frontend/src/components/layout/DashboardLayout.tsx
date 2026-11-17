import { useState, useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, LayoutDashboard, FileText, Search, Briefcase, Settings,
  LogOut, Menu, X, Bell, ChevronDown, User, Play, CheckCircle2,
  ExternalLink, ShieldCheck, Check, Trash2, Bot, GraduationCap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { authService } from "@/services/authService";

const sidebarLinks = [
  { name: "Executive Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Curated Opportunities", href: "/candidate/jobs", icon: Search },
  { name: "Application Tracking", href: "/dashboard/applications", icon: Briefcase },
  { name: "Autonomous Agent", href: "/dashboard/automation", icon: Play },
  { name: "Resume & ATS Calibration", href: "/dashboard/resume", icon: FileText },
  { name: "Practice", href: "/dashboard/practice", icon: GraduationCap },
  { name: "Candidate Profile", href: "/dashboard/profile", icon: User },
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

  const getCachedReadIds = (): Set<string> => {
    try {
      const stored = localStorage.getItem("read_notification_ids");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };

  const addCachedReadId = (id: string) => {
    try {
      const set = getCachedReadIds();
      set.add(String(id));
      localStorage.setItem("read_notification_ids", JSON.stringify(Array.from(set)));
    } catch (e) {
      console.warn("Could not cache read notification id:", e);
    }
  };

  const addCachedReadIds = (ids: string[]) => {
    try {
      const set = getCachedReadIds();
      ids.forEach((id) => set.add(String(id)));
      localStorage.setItem("read_notification_ids", JSON.stringify(Array.from(set)));
    } catch (e) {
      console.warn("Could not batch cache read notification ids:", e);
    }
  };

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const cached = getCachedReadIds();
    return defaultNotifications.map((n) => ({
      ...n,
      read: cached.has(n.id) ? true : n.read,
    }));
  });

  const [currentUser, setCurrentUser] = useState<{
    full_name?: string;
    email?: string;
    avatar_url?: string;
    role?: string;
  } | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchUser = async () => {
      try {
        const storedName = localStorage.getItem("candidate_name");
        const storedEmail = localStorage.getItem("candidate_email");
        const storedAvatar = localStorage.getItem("candidate_avatar_url");

        if (storedName || storedEmail) {
          if (isMounted) {
            setCurrentUser({
              full_name: storedName || "Candidate",
              email: storedEmail || "candidate@autoagenthire.com",
              avatar_url: storedAvatar || undefined,
            });
          }
        }

        const userRes = await authService.getCurrentUser();
        if (userRes && isMounted) {
          const profileData = (userRes as any).profile || (userRes as any).user || userRes;
          setCurrentUser({
            full_name: profileData?.full_name || storedName || "Candidate",
            email: profileData?.email || (userRes as any).user?.email || storedEmail || "candidate@autoagenthire.com",
            avatar_url: profileData?.avatar_url || storedAvatar || undefined,
            role: (userRes as any).role,
          });
        }
      } catch (err) {
        console.warn("Could not fetch user profile:", err);
      }
    };
    fetchUser();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadNotifications = async () => {
      try {
        const res = await apiClient.get<NotificationItem[]>(API_ENDPOINTS.notifications.list);
        if (res && Array.isArray(res) && isMounted) {
          const cached = getCachedReadIds();
          setNotifications(
            res.map((item) => ({
              ...item,
              read: cached.has(item.id) ? true : item.read,
            }))
          );
        }
      } catch (err) {
        console.warn("Could not fetch remote notifications:", err);
      }
    };

    loadNotifications();

    const loadJobNotifications = async () => {
      try {
        const jobs = await apiClient.get<any[]>(API_ENDPOINTS.recruiter.candidateJobs);
        if (jobs && Array.isArray(jobs) && jobs.length > 0 && isMounted) {
          const cached = getCachedReadIds();
          const jobNotifs: NotificationItem[] = jobs.slice(0, 3).map((job) => {
            const id = `job-notif-${job.id || job.uuid}`;
            return {
              id,
              title: `Opportunity: ${job.title}`,
              message: `${job.company_name} published a verified role (${job.vacancies || 1} openings - ${job.job_type || "Full-time"}). Tap to apply.`,
              time: "New",
              read: cached.has(id),
              type: "job",
              actionHref: "/candidate/jobs",
            };
          });

          setNotifications((prev) => {
            const incomingIds = new Set(jobNotifs.map((j) => j.id));
            const retained = prev.filter((p) => !incomingIds.has(p.id) && p.id !== "notif-1");
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
      loadNotifications();
    };
    window.addEventListener("jobPostingsUpdated", handleJobUpdate);
    window.addEventListener("applicationSubmitted", handleJobUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener("jobPostingsUpdated", handleJobUpdate);
      window.removeEventListener("applicationSubmitted", handleJobUpdate);
    };
  }, []);

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

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    addCachedReadIds(notifications.map((n) => n.id));
    try {
      await apiClient.post(API_ENDPOINTS.notifications.markAllRead);
    } catch (err) {
      console.warn("Could not persist mark-all-read to backend:", err);
    }
  };

  const clearAllNotifications = async () => {
    setNotifications([]);
    try {
      await apiClient.delete(API_ENDPOINTS.notifications.clearAll);
    } catch (err) {
      console.warn("Could not clear notifications on backend:", err);
    }
  };

  const markSingleAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    addCachedReadId(id);
    try {
      await apiClient.post(API_ENDPOINTS.notifications.markRead(id));
    } catch (err) {
      console.warn("Could not persist notification read status to backend:", err);
    }
  };

  const getUserInitials = () => {
    if (currentUser?.full_name) {
      const parts = currentUser.full_name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    return "CA";
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes("/candidate/jobs") || path.includes("/dashboard/jobs")) return "Curated Opportunities";
    if (path.includes("/dashboard/applications")) return "Application Tracking";
    if (path.includes("/dashboard/automation")) return "Autonomous Agent Control";
    if (path.includes("/dashboard/resume")) return "ATS Diagnostic & Resume Suite";
    if (path.includes("/dashboard/profile")) return "Candidate Credentials";
    return "Executive Overview";
  };

  return (
    <div className="min-h-screen bg-[#F7F5EF] text-[#202722] flex">
      {/* Deep Forest Green Editorial Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-40 bg-[#123B32] text-[#F7F5EF] border-r border-[#123B32]/40 transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        {/* Brand Header */}
        <div className="h-20 flex items-center justify-between px-5 border-b border-white/10">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FF7058] text-white flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col">
                <span className="font-serif text-lg font-bold tracking-tight text-[#F7F5EF] leading-tight">
                  AutoAgentHire
                </span>
                <span className="text-[10px] text-[#A9BBA7] font-semibold tracking-wider uppercase">
                  Candidate Portal
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-white/10 text-[#A9BBA7] hover:text-white transition-colors"
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {sidebarLinks.map((link) => {
            const isActive =
              location.pathname === link.href ||
              (link.href === "/candidate/jobs" &&
                (location.pathname === "/candidate/jobs" || location.pathname === "/dashboard/jobs"));

            return (
              <Link
                key={link.name}
                to={link.href}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  isActive
                    ? "bg-white/10 text-[#F7F5EF] border-l-2 border-[#FF7058] shadow-xs"
                    : "text-[#A9BBA7] hover:bg-white/5 hover:text-white"
                }`}
              >
                <link.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#FF7058]" : ""}`} />
                {sidebarOpen && <span className="truncate">{link.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Profile / Sign Out in Sidebar */}
        <div className="p-4 border-t border-white/10 mt-auto">
          {sidebarOpen ? (
            <div className="flex items-center justify-between text-xs">
              <div className="min-w-0 pr-2">
                <span className="block font-semibold text-white truncate">
                  {currentUser?.full_name?.split(" ")[0] || "Candidate"}
                </span>
                <span className="block text-[10px] text-[#A9BBA7] truncate">
                  {currentUser?.email || "candidate@autoagenthire.com"}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded text-[#A9BBA7] hover:text-red-400 hover:bg-white/5 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full flex justify-center p-2 rounded text-[#A9BBA7] hover:text-red-400 hover:bg-white/5 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              className="fixed inset-y-0 left-0 w-64 bg-[#123B32] text-[#F7F5EF] z-50 lg:hidden border-r border-[#123B32]/40 flex flex-col"
            >
              <div className="h-20 flex items-center justify-between px-5 border-b border-white/10">
                <Link to="/dashboard" className="flex items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
                  <div className="w-10 h-10 rounded-lg bg-[#FF7058] text-white flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-serif text-lg font-bold text-white block">AutoAgentHire</span>
                    <span className="text-[10px] text-[#A9BBA7] block uppercase font-semibold">Candidate Portal</span>
                  </div>
                </Link>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-[#A9BBA7] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="p-4 space-y-1.5 flex-1 overflow-y-auto">
                {sidebarLinks.map((link) => {
                  const isActive =
                    location.pathname === link.href ||
                    (link.href === "/candidate/jobs" &&
                      (location.pathname === "/candidate/jobs" || location.pathname === "/dashboard/jobs"));

                  return (
                    <Link
                      key={link.name}
                      to={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-lg text-xs font-semibold ${
                        isActive
                          ? "bg-white/10 text-white border-l-2 border-[#FF7058]"
                          : "text-[#A9BBA7] hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <link.icon className={`w-4 h-4 ${isActive ? "text-[#FF7058]" : ""}`} />
                      <span>{link.name}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="p-4 border-t border-white/10 mt-auto">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold text-[#A9BBA7] hover:text-red-400 hover:bg-white/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col ${
          sidebarOpen ? "lg:ml-64" : "lg:ml-20"
        } transition-all duration-300 min-w-0 bg-[#F7F5EF]`}
      >
        {/* Top Header Bar */}
        <header className="h-20 bg-[#F7F5EF]/95 backdrop-blur-md border-b border-[#E6E5DC] flex items-center justify-between px-6 lg:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#123B32] hover:bg-stone-200/50"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-2xl font-bold tracking-tight text-[#123B32]">
                {getPageTitle()}
              </h1>
              <Badge
                variant="outline"
                className="hidden sm:inline-flex text-[10px] uppercase font-bold tracking-wider border-[#123B32]/30 text-[#123B32] bg-white px-2.5 py-0.5"
              >
                Candidate Suite
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Button */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => {
                  setNotificationsOpen(!notificationsOpen);
                  setProfileOpen(false);
                }}
                className={`relative p-2.5 rounded-lg border transition-all ${
                  notificationsOpen
                    ? "bg-white border-[#123B32] text-[#123B32]"
                    : "bg-white hover:bg-stone-50 border-[#E6E5DC] text-[#777D74]"
                }`}
                title="Notifications"
                aria-label="View notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#FF7058] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white border border-[#E6E5DC] shadow-xl z-50 overflow-hidden"
                  >
                    <div className="p-3.5 border-b border-[#E6E5DC] flex items-center justify-between bg-[#F7F5EF]">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-[#123B32]" />
                        <span className="font-serif text-sm font-bold text-[#123B32]">Notifications</span>
                        {unreadCount > 0 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF7058]/10 text-[#FF7058]">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-[11px] text-[#123B32] hover:underline font-semibold"
                          >
                            Mark all read
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={clearAllNotifications}
                            className="text-[11px] text-[#777D74] hover:text-red-600"
                            title="Clear all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-[#E6E5DC]">
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
                            className={`p-3.5 flex items-start gap-3 hover:bg-[#F7F5EF] cursor-pointer transition-colors ${
                              !notif.read ? "bg-[#FF7058]/5" : ""
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-[#123B32]/10 text-[#123B32] flex items-center justify-center shrink-0 mt-0.5">
                              {notif.type === "job" ? <Briefcase className="w-4 h-4 text-[#123B32]" /> :
                               notif.type === "ats" ? <Sparkles className="w-4 h-4 text-[#FF7058]" /> :
                               notif.type === "application" ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> :
                               <Bot className="w-4 h-4 text-[#123B32]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-xs font-bold truncate ${!notif.read ? "text-[#123B32]" : "text-[#777D74]"}`}>
                                  {notif.title}
                                </p>
                                <span className="text-[10px] text-[#777D74] shrink-0">{notif.time}</span>
                              </div>
                              <p className="text-[11px] text-[#777D74] mt-0.5 leading-snug line-clamp-2">
                                {notif.message}
                              </p>
                            </div>
                            {!notif.read && (
                              <span className="w-2 h-2 rounded-full bg-[#FF7058] shrink-0 self-center" />
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-[#777D74] space-y-2">
                          <Check className="w-6 h-6 mx-auto text-[#A9BBA7]" />
                          <p className="text-xs">All notifications cleared.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <div
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setNotificationsOpen(false);
                }}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer bg-white ${
                  profileOpen ? "border-[#123B32]" : "border-[#E6E5DC] hover:border-[#123B32]/40"
                }`}
              >
                <div className="w-7 h-7 rounded bg-[#123B32] text-white flex items-center justify-center text-xs font-bold">
                  {getUserInitials()}
                </div>
                <div className="hidden sm:block text-left">
                  <span className="text-xs font-bold block text-[#123B32] leading-tight">
                    {currentUser?.full_name?.split(" ")[0] || "Candidate"}
                  </span>
                  <span className="text-[10px] text-[#777D74] block leading-tight">Verified</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-[#777D74] transition-transform ${profileOpen ? "rotate-180 text-[#123B32]" : ""}`} />
              </div>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-64 rounded-xl bg-white border border-[#E6E5DC] shadow-xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-[#E6E5DC] bg-[#F7F5EF]">
                      <p className="text-xs font-bold truncate text-[#123B32]">
                        {currentUser?.full_name || "Candidate User"}
                      </p>
                      <p className="text-[11px] text-[#777D74] truncate">
                        {currentUser?.email || "candidate@autoagenthire.com"}
                      </p>
                    </div>

                    <div className="p-2 space-y-1 text-xs">
                      <Link
                        to="/dashboard/profile"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#123B32] hover:bg-[#F7F5EF] font-semibold"
                      >
                        <User className="w-3.5 h-3.5 text-[#123B32]" />
                        <span>Profile Credentials</span>
                      </Link>
                      <Link
                        to="/dashboard/resume"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#777D74] hover:text-[#123B32] hover:bg-[#F7F5EF]"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>ATS Score & Resume</span>
                      </Link>
                      <Link
                        to="/dashboard/applications"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#777D74] hover:text-[#123B32] hover:bg-[#F7F5EF]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Tracked Applications</span>
                      </Link>
                    </div>

                    <div className="p-2 border-t border-[#E6E5DC] bg-[#F7F5EF]">
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-50 text-left"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Dynamic Nested Page Content */}
        <main className="flex-1 p-6 lg:p-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
