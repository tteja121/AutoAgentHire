import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  Send, Eye, TrendingUp,
  Pause, FileText, Activity, Sparkles,
  Briefcase, ArrowRight, CheckCircle2, ShieldCheck,
  MapPin, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { apiClient, API_ENDPOINTS, API_BASE_URL } from "@/lib/api";
import { authService } from "@/services/authService";
import { jobsService } from "@/services/jobsService";
import { getCandidateProfile } from "@/utils/profileSync";
import { getCleanJobDescriptionPreview } from "@/components/JobDescriptionRenderer";

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

  useEffect(() => {
    const fetchFeaturedJobs = async () => {
      setLoadingJobs(true);
      try {
        const jobs = await jobsService.getJobs({ limit: 3 });
        if (jobs && jobs.length > 0) {
          setFeaturedJobs(
            jobs.map((j) => ({
              id: j.id,
              title: j.title,
              company_name: j.companies?.name || "AutoAgentHire Partner",
              location: j.location || "Remote",
              job_type: j.employment_type || "Full-time",
              salary_description:
                j.salary_min && j.salary_max
                  ? `$${j.salary_min.toLocaleString()} - $${j.salary_max.toLocaleString()}`
                  : "Competitive",
              description: j.description || "Exciting role with verified hiring team.",
            }))
          );
        } else {
          const res = await apiClient.get(API_ENDPOINTS.recruiter.candidateJobs);
          if (Array.isArray(res.data)) {
            setFeaturedJobs(res.data.slice(0, 3));
          }
        }
      } catch (error) {
        console.error("Failed to fetch featured jobs:", error);
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
      change: "Direct to verified hiring teams",
      icon: Send,
      trend: true,
    },
    {
      title: "Identified Opportunities",
      value: agentStatus?.jobs_found || "0",
      change: "Calibrated to your competencies",
      icon: Briefcase,
    },
    {
      title: "Average ATS Precision",
      value: "96.4%",
      change: "Semantic keyword rating",
      icon: Activity,
    },
    {
      title: "Agent Pipeline State",
      value: agentStatus?.status === "running" ? "Active" : "Standby",
      change: "Ready to deploy",
      icon: Eye,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Editorial Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="p-8 sm:p-10 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow relative overflow-hidden"
      >
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full bg-[#123B32]/10 text-[#123B32] border border-[#123B32]/20">
              Candidate Workspace
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              Verified Pipeline Active
            </span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#123B32] tracking-tight leading-tight">
            Welcome back{userName ? `, ${userName}` : ""}.
          </h1>

          <p className="text-sm sm:text-base text-[#777D74] leading-relaxed font-sans max-w-2xl">
            {agentStatus?.status === "running"
              ? "Your autonomous agent is monitoring live verified openings and matching against your ATS credentials."
              : "Review calibrated engineering roles, inspect your ATS diagnostic metrics, and deploy targeted job search flows."}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              onClick={() => navigate("/candidate/jobs")}
              className="bg-[#FF7058] hover:bg-[#FA5D42] text-white text-xs font-semibold px-5 py-2.5 h-11 rounded-lg shadow-sm gap-2"
            >
              <Briefcase className="w-4 h-4" />
              <span>Explore Curated Roles</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard/resume")}
              className="border-[#E6E5DC] text-[#123B32] hover:bg-[#F7F5EF] text-xs font-semibold px-5 py-2.5 h-11 rounded-lg gap-2"
            >
              <FileText className="w-4 h-4 text-[#123B32]" />
              <span>ATS Score Diagnostic</span>
            </Button>
          </div>
        </div>

        {/* Decorative Editorial Watermark */}
        <div className="absolute right-[-4%] bottom-[-15%] font-serif text-[180px] text-[#123B32]/[0.03] select-none pointer-events-none leading-none">
          Advantage
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
          >
            <div className="p-6 rounded-xl bg-white border border-[#E6E5DC] editorial-shadow editorial-card-hover h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[#F7F5EF] text-[#123B32] flex items-center justify-center border border-[#E6E5DC]">
                    <stat.icon className="w-5 h-5" />
                  </div>
                  {stat.trend && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Live
                    </span>
                  )}
                </div>
                <div className="font-serif text-3xl font-bold text-[#123B32] mb-1">
                  {stat.value}
                </div>
                <h4 className="text-xs font-bold text-[#202722]">{stat.title}</h4>
              </div>
              <p className="text-[11px] text-[#777D74] mt-3 pt-3 border-t border-[#E6E5DC]">
                {stat.change}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions & Autonomous Agent Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions Panel */}
        <div className="lg:col-span-2 p-6 sm:p-8 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E6E5DC]">
            <div>
              <h3 className="font-serif text-xl font-bold text-[#123B32]">
                Strategic Shortcuts
              </h3>
              <p className="text-xs text-[#777D74] mt-0.5">
                Direct access to high-impact career capabilities
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                title: "Curated Roles",
                desc: "Verified corporate vacancies & direct applications",
                icon: Briefcase,
                href: "/candidate/jobs",
              },
              {
                title: "Candidate Profile",
                desc: "Update mobile, bio, skills, and work history",
                icon: ShieldCheck,
                href: "/dashboard/profile",
              },
              {
                title: "Application Audit",
                desc: "Track status, timestamps & recruiter actions",
                icon: Send,
                href: "/dashboard/applications",
              },
              {
                title: "ATS Parser",
                desc: "Extract competencies & audit keyword density",
                icon: FileText,
                href: "/dashboard/resume",
              },
            ].map((action, i) => (
              <div
                key={i}
                onClick={() => navigate(action.href)}
                className="p-4 rounded-xl bg-[#F7F5EF] hover:bg-white border border-[#E6E5DC] hover:border-[#123B32]/40 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="w-9 h-9 rounded-lg bg-white border border-[#E6E5DC] text-[#123B32] flex items-center justify-center mb-3 group-hover:bg-[#123B32] group-hover:text-white transition-colors">
                  <action.icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#123B32] group-hover:text-[#FF7058] transition-colors">
                    {action.title}
                  </h4>
                  <p className="text-[11px] text-[#777D74] mt-1 leading-snug">
                    {action.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Monitor Card */}
        <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#E6E5DC]">
              <h3 className="font-serif text-lg font-bold text-[#123B32]">
                Agent Protocol
              </h3>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span>Ready</span>
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#F7F5EF] border border-[#E6E5DC] space-y-2.5 text-xs mb-4">
              <div className="flex justify-between">
                <span className="text-[#777D74]">Requisitions Scanned:</span>
                <span className="font-bold text-[#123B32]">{agentStatus?.jobs_found || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777D74]">Target Submissions:</span>
                <span className="font-bold text-[#123B32]">{agentStatus?.applications_submitted || 0} / 25</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-stone-200 overflow-hidden mt-1">
                <div
                  className="h-full bg-[#123B32] rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      ((agentStatus?.applications_submitted || 0) / 25) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <Button
            onClick={handleStartSearch}
            className="w-full bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] text-xs font-semibold h-11 rounded-lg gap-2"
          >
            <Briefcase className="w-4 h-4 text-[#FF7058]" />
            <span>Deploy Search Flow</span>
          </Button>
        </div>
      </div>

      {/* Featured Curated Roles */}
      <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-6 border-b border-[#E6E5DC] gap-2">
          <div>
            <h3 className="font-serif text-2xl font-bold text-[#123B32]">
              Verified Requisitions
            </h3>
            <p className="text-xs text-[#777D74]">
              Direct postings by verified corporate recruiters seeking candidates
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => navigate("/candidate/jobs")}
            className="text-xs text-[#FF7058] hover:text-[#FA5D42] font-semibold gap-1 p-0 h-auto"
          >
            <span>View All Board Requisitions</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {loadingJobs ? (
          <div className="py-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-[#123B32] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : featuredJobs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {featuredJobs.map((job) => (
              <div
                key={job.id}
                className="p-5 rounded-xl bg-[#F7F5EF] border border-[#E6E5DC] hover:border-[#123B32]/40 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-serif text-base font-bold text-[#123B32] line-clamp-1">
                        {job.title}
                      </h4>
                      <p className="text-xs text-[#777D74]">{job.company_name}</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white text-[#123B32] border border-[#E6E5DC] shrink-0">
                      {job.job_type}
                    </span>
                  </div>

                  <div className="text-xs text-[#777D74] space-y-1">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-[#123B32]" />
                      <span>{job.salary_description}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#123B32]" />
                      <span>{job.location}</span>
                    </div>
                  </div>

                  <p className="text-xs text-[#777D74] line-clamp-2 leading-relaxed font-sans">
                    {getCleanJobDescriptionPreview(job.description, 160)}
                  </p>
                </div>

                <Button
                  onClick={() => navigate("/candidate/jobs")}
                  className="w-full bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] text-xs font-semibold h-10 rounded-lg gap-2 mt-4"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspect & Apply</span>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-[#777D74] space-y-2">
            <Briefcase className="w-8 h-8 mx-auto text-[#A9BBA7]" />
            <p className="text-xs">No active verified postings found at this moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
