import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  Send, Eye, TrendingUp, TrendingDown,
  Pause, FileText, Search, Activity, Sparkles,
  Briefcase, ArrowRight, CheckCircle2, ShieldCheck,
  Building2, MapPin, DollarSign, Calendar, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { apiClient, API_ENDPOINTS, API_BASE_URL } from "@/lib/api";
import { authService } from "@/services/authService";
import { jobsService } from "@/services/jobsService";
import { getCandidateProfile } from "@/utils/profileSync";

export default function DashboardHome() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [agentStatus, setAgentStatus] = useState<any>(null);
  const [userName, setUserName] = useState<string>(() => {
    const p = getCandidateProfile();
    return p.candidate_name && p.candidate_name !== "Candidate" ? p.candidate_name.split(" ")[0] : "";
  });
  const [featuredJobs, setFeaturedJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Fetch logged-in user's name
  useEffect(() => {
    const fetchUser = async () => {
      const p = getCandidateProfile();
      if (p.candidate_name && p.candidate_name !== "Candidate") {
        setUserName(p.candidate_name.split(" ")[0]);
      }
      try {
        const userRes = await authService.getCurrentUser();
        if (userRes?.profile?.full_name && userRes.profile.full_name.trim()) {
          setUserName(userRes.profile.full_name.split(" ")[0]);
        } else if (userRes?.user?.email) {
          setUserName(userRes.user.email.split("@")[0]);
        }
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
      }
    };
    fetchUser();

    const handleProfileSync = () => {
      fetchUser();
    };
    const handleLogout = () => {
      setUserName("");
      setAgentStatus(null);
    };
    window.addEventListener("candidateProfileUpdated", handleProfileSync);
    window.addEventListener("authLogout", handleLogout);
    return () => {
      window.removeEventListener("candidateProfileUpdated", handleProfileSync);
      window.removeEventListener("authLogout", handleLogout);
    };
  }, []);

  // Fetch agent status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/agent/status`);
        const data = await response.json();
        setAgentStatus(data.detail);
      } catch (error) {
        console.error("Failed to fetch status:", error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch featured recruiter jobs for Candidate Home dashboard
  useEffect(() => {
    const fetchFeaturedJobs = async () => {
      setLoadingJobs(true);
      try {
        const jobs = await jobsService.getJobs({ limit: 3 });
        if (jobs && jobs.length > 0) {
          setFeaturedJobs(jobs.map(j => ({
            id: j.id,
            title: j.title,
            company_name: j.companies?.name || "AutoAgentHire Partner",
            location: j.location || "Remote",
            job_type: j.employment_type || "Full-time",
            salary_description: j.salary_min && j.salary_max ? `$${j.salary_min.toLocaleString()} - $${j.salary_max.toLocaleString()}` : "Competitive",
          })));
        } else {
          const res = await apiClient.get(API_ENDPOINTS.recruiter.candidateJobs);
          if (Array.isArray(res.data)) {
            setFeaturedJobs(res.data.slice(0, 3));
          }
        }
      } catch (err) {
        console.error("Failed to load featured jobs:", err);
      } finally {
        setLoadingJobs(false);
      }
    };
    fetchFeaturedJobs();
  }, []);

  const handleStartSearch = () => {
    navigate("/candidate/jobs");
  };

  const stats = [
    {
      title: "Applications Submitted",
      value: agentStatus?.applications_submitted || "0",
      change: agentStatus?.applications_submitted > 0 ? "+14% this week" : "Ready to submit",
      trend: "up",
      icon: Send,
      color: "text-primary",
      bgColor: "bg-primary/20",
    },
    {
      title: "Matching Jobs Found",
      value: agentStatus?.jobs_found || (featuredJobs.length > 0 ? `${featuredJobs.length}+` : "0"),
      change: "Verified recruiter postings",
      trend: "up",
      icon: Search,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/20",
    },
    {
      title: "AI Agent Status",
      value:
        agentStatus?.status === "running"
          ? "Active"
          : agentStatus?.status === "completed"
          ? "Complete"
          : "Idle",
      change: agentStatus?.phase || "Ready for automation",
      icon: Activity,
      color: agentStatus?.status === "running" ? "text-emerald-400" : "text-amber-400",
      bgColor: agentStatus?.status === "running" ? "bg-emerald-500/20" : "bg-amber-500/20",
    },
    {
      title: "Opportunities Previewed",
      value: agentStatus?.applications_previewed || "0",
      change: "Evaluated by AI",
      icon: Eye,
      color: "text-blue-400",
      bgColor: "bg-blue-500/20",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-primary/20 via-card to-card border border-white/10 shadow-xl relative overflow-hidden"
      >
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-xs">
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Candidate Autonomous Job Suite
            </Badge>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Verified Organization Access
            </Badge>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Welcome back{userName ? `, ${userName}` : ""}! 👋
          </h1>
          <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
            {agentStatus?.status === "running"
              ? "Your AI autonomous job agent is actively discovering and applying to matching roles in the background."
              : "Explore verified recruiter jobs, view role requirements and company vacancies, and manage your profile seamlessly."}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button variant="hero" onClick={() => navigate("/candidate/jobs")} className="gap-2">
              <Briefcase className="w-4 h-4" />
              <span>Browse Verified Jobs</span>
            </Button>
            <Button variant="outline" onClick={() => navigate("/dashboard/profile")} className="gap-2 border-white/10">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Manage Candidate Profile</span>
            </Button>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute right-0 top-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
          >
            <Card variant="glass" hover="glow" className="h-full border-white/10">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-11 h-11 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  {stat.trend && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <TrendingUp className="w-3 h-3" />
                      <span>Live</span>
                    </div>
                  )}
                </div>
                <div className="text-2xl md:text-3xl font-bold font-display mb-1 text-foreground">{stat.value}</div>
                <div className="text-xs font-medium text-foreground">{stat.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{stat.change}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions & Automation Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="lg:col-span-2"
        >
          <Card variant="glass" className="border-white/10 h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Portal Quick Actions</CardTitle>
                  <CardDescription className="text-xs">Direct shortcuts to high-value candidate workflows</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Action 1: Browse Jobs */}
              <div
                onClick={() => navigate("/candidate/jobs")}
                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/40 cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Browse Jobs</h4>
                  <p className="text-[11px] text-muted-foreground mt-1">Verified recruiter listings & direct CV applications</p>
                </div>
              </div>

              {/* Action 2: Candidate Profile */}
              <div
                onClick={() => navigate("/dashboard/profile")}
                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/40 cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground group-hover:text-emerald-400 transition-colors">Candidate Profile</h4>
                  <p className="text-[11px] text-muted-foreground mt-1">Update mobile number (all country formats), bio, skills & experience</p>
                </div>
              </div>

              {/* Action 3: Applications Hub */}
              <div
                onClick={() => navigate("/dashboard/applications")}
                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/40 cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Applications Hub</h4>
                  <p className="text-[11px] text-muted-foreground mt-1">Review submitted applications, matching status & recruiters</p>
                </div>
              </div>

              {/* Action 4: Resume Parser */}
              <div
                onClick={() => navigate("/dashboard/resume")}
                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/40 cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground group-hover:text-emerald-400 transition-colors">Resume Parser</h4>
                  <p className="text-[11px] text-muted-foreground mt-1">Extract skills, experience & structured embeddings</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Automation Status Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card variant="glass" className="border-white/10 h-full flex flex-col justify-between">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>AI Search Agent</span>
                <span
                  className={`flex items-center gap-1.5 text-xs font-normal ${
                    agentStatus?.status === "running"
                      ? "text-emerald-400"
                      : agentStatus?.status === "completed"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      agentStatus?.status === "running"
                        ? "bg-emerald-400 animate-pulse"
                        : agentStatus?.status === "completed"
                        ? "bg-primary"
                        : "bg-muted-foreground"
                    }`}
                  />
                  {agentStatus?.status === "running"
                    ? "Running"
                    : agentStatus?.status === "completed"
                    ? "Completed"
                    : "Idle"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Scanned Roles</span>
                  <span className="font-semibold">{agentStatus?.jobs_found || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Auto-Applied</span>
                  <span className="font-semibold">{agentStatus?.applications_submitted || 0}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        ((agentStatus?.applications_submitted || 0) / 25) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="hero"
                  size="sm"
                  className="flex-1 text-xs gap-1.5"
                  onClick={handleStartSearch}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Explore Jobs</span>
                </Button>
                {agentStatus?.status === "running" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={async () => {
                      try {
                        await fetch(`${API_BASE_URL}/api/agent/pause`, { method: "POST" });
                        toast({ title: "Agent paused" });
                      } catch {
                        toast({ title: "Failed to pause agent", variant: "destructive" });
                      }
                    }}
                  >
                    <Pause className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Featured Verified Recruiter Jobs Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        <Card variant="glass" className="border-white/10">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary" />
                Featured Verified Opportunities
              </CardTitle>
              <CardDescription className="text-xs">
                Direct postings from approved recruiters awaiting qualified candidates
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/candidate/jobs")}
              className="text-xs text-primary hover:text-primary/80 gap-1"
            >
              <span>View All Board Jobs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loadingJobs ? (
              <div className="py-12 flex justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : featuredJobs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {featuredJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/30 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold line-clamp-1">{job.title}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">{job.company_name}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                          {job.job_type}
                        </Badge>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-primary" />
                          <span className="truncate">{job.salary_description}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-primary" />
                          <span className="truncate">{job.location}</span>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {job.description}
                      </p>
                    </div>

                    <Button
                      variant="hero"
                      size="sm"
                      onClick={() => navigate("/candidate/jobs")}
                      className="w-full text-xs gap-1.5 mt-2"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Roles & Apply</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground space-y-2">
                <Briefcase className="w-10 h-10 mx-auto opacity-40" />
                <p className="text-xs">No active verified jobs found yet.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/candidate/jobs")}
                  className="text-xs"
                >
                  Open Job Board
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
