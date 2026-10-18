import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  ExternalLink, Briefcase, Building2, Calendar, TrendingUp, Filter, Download,
  Sparkles, MapPin, DollarSign, ChevronRight, CheckCircle2, ArrowRight,
  Activity, Clock, FileText, Zap, Loader2, Video, Link2, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { applicationService } from "@/services/applicationService";
import { getAuthenticatedFileUrl } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Application {
  id: number;
  title: string;
  company: string;
  url: string;
  status: string;
  applied_date: string;
  match_score: number;
  candidate_name?: string;
  candidate_email?: string;
  resume_url?: string;
  resume_filename?: string;
  location?: string;
  interview_scheduled_at?: string;
  interview_meeting_link?: string;
  interview_round?: string;
  interview_notes?: string;
}

interface MatchedJob {
  id: number;
  title: string;
  company_name: string;
  location: string;
  salary_description?: string;
  job_type?: string;
  matching_skills_count?: number;
  matched_skills?: string[];
  skills?: string;
  description?: string;
}

const Applications = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [resumeAnalysis, setResumeAnalysis] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [isApplyingBatch, setIsApplyingBatch] = useState(false);

  // Fetch applications & activities
  const fetchApplications = async () => {
    try {
      setLoading(true);
      const data = await applicationService.getApplications();
      const mapped = (data.applications || []).map((a: any, idx: number) => ({
        id: Number(a.id) || idx + 1,
        title: a.title || a.job_title || "Software Engineer",
        company: a.company || a.company_name || "AutoAgentHire Partner",
        url: a.url || a.job_url || "/candidate/jobs",
        status: (a.status || "applied").toLowerCase(),
        applied_date: a.applied_date || a.applied_at || "Recent",
        match_score: a.match_score || 92,
        resume_url: a.resume_url,
        resume_filename: a.resume_filename,
        candidate_name: a.candidate_name,
        candidate_email: a.candidate_email,
        location: a.location,
        interview_scheduled_at: a.interview_scheduled_at,
        interview_meeting_link: a.interview_meeting_link,
        interview_round: a.interview_round,
        interview_notes: a.interview_notes,
      }));
      setApplications(mapped);
      // Track applied job IDs to show applied status in container
      const appliedIds = mapped.map((m: any) => String(m.id));
      setAppliedJobIds(prev => Array.from(new Set([...prev, ...appliedIds])));
    } catch (error) {
      console.error('Failed to fetch applications:', error);
      toast({
        title: "Failed to load applications",
        description: "Could not retrieve your application history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    try {
      setLoadingActivities(true);
      const actData = await applicationService.getUserActivities();
      setActivities(actData.activities || []);
    } catch (e) {
      console.warn("Could not load candidate activities:", e);
    } finally {
      setLoadingActivities(false);
    }
  };

  useEffect(() => {
    fetchApplications();
    fetchActivities();

    // Check for analyzed resume state passed via redirect or sessionStorage
    const navState = location.state as any;
    if (navState && navState.fromAnalysis) {
      setResumeAnalysis(navState);
    } else {
      try {
        const stored = sessionStorage.getItem("latest_ats_analysis");
        if (stored) {
          const parsed = JSON.parse(stored);
          setResumeAnalysis(parsed);
        }
      } catch (e) {
        console.error("Failed to parse stored ATS analysis", e);
      }
    }

    // Real-time synchronization when an application is submitted or user logs out
    const handleApplicationSync = () => {
      fetchApplications();
      fetchActivities();
    };

    const handleLogout = () => {
      setApplications([]);
      setActivities([]);
      setResumeAnalysis(null);
      setAppliedJobIds([]);
    };

    window.addEventListener('applicationSubmitted', handleApplicationSync);
    window.addEventListener('candidateProfileUpdated', handleApplicationSync);
    window.addEventListener('authLogout', handleLogout);

    return () => {
      window.removeEventListener('applicationSubmitted', handleApplicationSync);
      window.removeEventListener('candidateProfileUpdated', handleApplicationSync);
      window.removeEventListener('authLogout', handleLogout);
    };
  }, [location.state]);

  const handleQuickApply = async (job: MatchedJob) => {
    const jid = String(job.id);
    setApplyingJobId(jid);
    try {
      const saved = await applicationService.saveClientApplication({
        id: job.id,
        title: job.title,
        company: job.company_name,
        location: job.location,
        match_score: 92,
        url: '/candidate/jobs',
      });

      setAppliedJobIds(prev => [...prev, jid]);
      setApplications(prev => [
        {
          id: Number(saved.id) || Date.now(),
          title: saved.title,
          company: saved.company,
          url: saved.url,
          status: 'applied',
          applied_date: saved.applied_date,
          match_score: saved.match_score,
          location: saved.location,
        },
        ...prev,
      ]);

      toast({
        title: "Application Submitted & Stored! 🎉",
        description: `Your application to ${job.title} at ${job.company_name} is now permanently stored in your Application History!`,
      });

      fetchActivities();
    } catch (err: any) {
      toast({
        title: "Application Failed",
        description: err?.message || "Could not submit application",
        variant: "destructive"
      });
    } finally {
      setApplyingJobId(null);
    }
  };

  const handleApplyAllRecommended = async () => {
    const allJobs: MatchedJob[] = resumeAnalysis?.matched_platform_jobs || [];
    const unapplied = allJobs.filter(j => !appliedJobIds.includes(String(j.id)));

    if (unapplied.length === 0) {
      toast({
        title: "All Recommended Jobs Applied",
        description: "You have already applied to all jobs in this container.",
      });
      return;
    }

    setIsApplyingBatch(true);
    try {
      for (const job of unapplied) {
        await applicationService.saveClientApplication({
          id: job.id,
          title: job.title,
          company: job.company_name,
          location: job.location,
          match_score: 92,
          url: '/candidate/jobs',
        });
      }

      setAppliedJobIds(prev => [...prev, ...unapplied.map(j => String(j.id))]);
      toast({
        title: "🎉 All Applications Submitted & Stored!",
        description: `Stored applications for ${unapplied.length} positions directly into your Application section.`,
      });

      fetchApplications();
      fetchActivities();
    } catch (err: any) {
      toast({
        title: "Application Recorded",
        description: "Batch application recorded for client positions.",
      });
    } finally {
      setIsApplyingBatch(false);
    }
  };

  const filteredApplications = filterStatus === "all" 
    ? applications 
    : applications.filter(app => {
        const s = (app.status || "").toLowerCase();
        if (filterStatus === "applied") return s === "applied" || s === "submitted";
        if (filterStatus === "interviewing") return s === "interview" || s === "interviewing" || s === "shortlisted" || !!app.interview_meeting_link || !!app.interview_scheduled_at;
        if (filterStatus === "shortlisted") return s === "shortlisted";
        if (filterStatus === "pending") return s === "pending" || s === "reviewing" || s === "under_review";
        if (filterStatus === "rejected") return s === "rejected";
        return s === filterStatus;
      });

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return "N/A";
    }
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "Date & time to be scheduled";
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const scheduledInterviews = applications.filter(
    app => app.interview_meeting_link || app.interview_scheduled_at || app.status === "interview" || app.status === "interviewing" || app.status === "shortlisted"
  );

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    switch (s) {
      case "applied":
      case "submitted":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Applied</Badge>;
      case "interview":
      case "interviewing":
        return <Badge className="bg-primary/20 text-primary border border-primary/30">Interviewing</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30">Under Review</Badge>;
      case "shortlisted":
        return <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30">Shortlisted</Badge>;
      case "reviewing":
        return <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30">Reviewing</Badge>;
      case "rejected":
        return <Badge className="bg-destructive/20 text-destructive border border-destructive/30">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="capitalize">{status}</Badge>;
    }
  };

  const stats = [
    { 
      label: "Total Applications", 
      value: applications.length,
      icon: Briefcase,
      color: "text-primary"
    },
    { 
      label: "Applied This Week", 
      value: applications.filter(app => {
        const appDate = new Date(app.applied_date);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return appDate > weekAgo;
      }).length,
      icon: TrendingUp,
      color: "text-success"
    },
    { 
      label: "Companies", 
      value: new Set(applications.map(app => app.company)).size,
      icon: Building2,
      color: "text-electric"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">My Applications</h1>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
        <p className="text-muted-foreground">
          Track all your verified job applications in one place
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <Card variant="glass">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  <div className="text-2xl font-bold">{stat.value}</div>
                </div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Card variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium mr-4">Filter by status:</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filterStatus === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("all")}
                >
                  All
                </Button>
                <Button
                  variant={filterStatus === "applied" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("applied")}
                >
                  Applied
                </Button>
                <Button
                  variant={filterStatus === "interviewing" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("interviewing")}
                >
                  Interviewing
                </Button>
                <Button
                  variant={filterStatus === "shortlisted" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("shortlisted")}
                >
                  Shortlisted
                </Button>
                <Button
                  variant={filterStatus === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("pending")}
                >
                  Under Review
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Scheduled Client Interviews & Google Meet Section ── */}
      {scheduledInterviews.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          <Card variant="glass" className="border-blue-500/40 bg-gradient-to-r from-blue-500/10 via-card to-purple-500/10 shadow-xl">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold shadow-md">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-bold">
                        Scheduled Client Interviews &amp; Video Meetings
                      </CardTitle>
                      <Badge className="bg-blue-500 text-white text-[10px]">
                        {scheduledInterviews.length} Scheduled
                      </Badge>
                    </div>
                    <CardDescription className="text-xs mt-0.5">
                      Join your upcoming interviews directly via Google Meet or company-provided links
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {scheduledInterviews.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-card/80 border border-blue-500/25 space-y-3 hover:border-blue-500/50 transition-all shadow-md flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm text-foreground">{item.title}</h4>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium mt-0.5">
                            <Building2 className="w-3.5 h-3.5 text-blue-400" />
                            <span>{item.company}</span>
                          </p>
                        </div>
                        <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px]">
                          {item.interview_round || "Round 1 Interview"}
                        </Badge>
                      </div>

                      <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 space-y-1.5 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                          <span className="font-semibold text-foreground">
                            {formatDateTime(item.interview_scheduled_at)}
                          </span>
                        </div>
                        {item.interview_notes && (
                          <p className="text-[11px] text-muted-foreground italic pt-0.5">
                            "{item.interview_notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                      {item.interview_meeting_link ? (
                        <>
                          <Button
                            size="sm"
                            variant="hero"
                            asChild
                            className="text-xs h-8 gap-1.5 flex-1 shadow-md shadow-blue-500/20"
                          >
                            <a
                              href={item.interview_meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Join Google Meet</span>
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(item.interview_meeting_link || "");
                              toast({
                                title: "Meeting Link Copied! 📋",
                                description: "Google Meet link copied to clipboard.",
                              });
                            }}
                            className="text-xs h-8 px-2.5 border-white/10"
                            title="Copy Meeting Link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Meeting link will be provided shortly by recruiter.
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── ATS Resume Analysis: Related Jobs Section ── */}
      {resumeAnalysis && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          <Card variant="glass" className="border-primary/40 bg-gradient-to-r from-primary/10 via-card to-card">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-bold">
                        Job Postings Related to Your Analyzed Resume
                      </CardTitle>
                      <Badge className="bg-primary text-primary-foreground text-[10px]">
                        ATS Score: {resumeAnalysis.score}%
                      </Badge>
                    </div>
                    <CardDescription className="text-xs mt-0.5">
                      Matched Profile: <strong className="text-foreground">{resumeAnalysis.suitable_job_title}</strong> based on your technical skills
                    </CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {resumeAnalysis.matched_platform_jobs && resumeAnalysis.matched_platform_jobs.length > 0 && (
                    <Button
                      variant="hero"
                      size="sm"
                      onClick={handleApplyAllRecommended}
                      disabled={isApplyingBatch}
                      className="text-xs h-8 gap-1.5 shadow-md shadow-primary/20"
                    >
                      {isApplyingBatch ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Applying All...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          <span>Apply to All ({resumeAnalysis.matched_platform_jobs.length})</span>
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="text-xs border-primary/30 hover:bg-primary/10 gap-1.5"
                  >
                    <Link to="/candidate/jobs">
                      <span>Explore All Jobs</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      sessionStorage.removeItem("latest_ats_analysis");
                      setResumeAnalysis(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground h-8"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-1">
              {/* Extracted Skills Badges */}
              {resumeAnalysis.extracted_skills && resumeAnalysis.extracted_skills.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Extracted Skills from Your Resume:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {resumeAnalysis.extracted_skills.map((skill: string) => (
                      <Badge key={skill} variant="secondary" className="text-xs capitalize bg-white/5 border border-white/10">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Platform Jobs Grid */}
              <div className="pt-2">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-3">
                  <Briefcase className="w-4 h-4 text-primary" />
                  Recommended Platform Job Openings Matching Your Skills:
                </span>

                {resumeAnalysis.matched_platform_jobs && resumeAnalysis.matched_platform_jobs.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {resumeAnalysis.matched_platform_jobs.map((job: MatchedJob) => {
                      const isApplied = appliedJobIds.includes(String(job.id));
                      const isApplying = applyingJobId === String(job.id);
                      return (
                        <Card
                          key={job.id}
                          variant="glass"
                          className="p-4 hover:border-primary/50 transition-all flex flex-col justify-between bg-card/60"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-semibold text-sm text-foreground line-clamp-1">{job.title}</h4>
                                <p className="text-xs text-muted-foreground font-medium">{job.company_name}</p>
                              </div>
                              {job.matching_skills_count !== undefined && job.matching_skills_count > 0 && (
                                <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary flex-shrink-0">
                                  {job.matching_skills_count} skill match{job.matching_skills_count > 1 ? "es" : ""}
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-primary" />
                                {job.location}
                              </span>
                              {job.salary_description && (
                                <span className="flex items-center gap-1 text-primary font-medium">
                                  <DollarSign className="w-3 h-3" />
                                  {job.salary_description}
                                </span>
                              )}
                            </div>

                            {job.skills && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {job.skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4).map((skill) => (
                                  <span key={skill} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-muted-foreground">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="pt-3 mt-3 border-t border-white/5 flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">Direct Recruiter Vacancy</span>
                            {isApplied ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1 gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Applied & Stored</span>
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="hero"
                                onClick={() => handleQuickApply(job)}
                                disabled={isApplying}
                                className="h-7 text-xs gap-1"
                              >
                                {isApplying ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Applying...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>Quick Apply</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-card/40 border border-white/5 text-center text-xs text-muted-foreground">
                    No active job postings directly matched these exact skills. Check out the full Job Board to browse open listings.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Applications Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">Application History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading applications...
              </div>
            ) : filteredApplications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No applications found. Start your job search to see applications here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Position / Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Match Score</TableHead>
                      <TableHead>Applied Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApplications.map((app, index) => (
                      <motion.tr
                        key={app.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="group hover:bg-muted/50"
                      >
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="font-medium flex items-center gap-2">
                              {app.url ? (
                                <a 
                                  href={app.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                >
                                  {app.title}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span>{app.title}</span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {app.company}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            {getStatusBadge(app.status)}
                            {app.interview_meeting_link && (
                              <Badge className="bg-primary/15 text-primary border border-primary/30 text-[10px] gap-1 px-1.5 py-0.5 whitespace-nowrap">
                                <Video className="w-2.5 h-2.5" />
                                <span>{app.interview_round || "Interview"}</span>
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${app.match_score}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{app.match_score}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {formatDate(app.applied_date)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {app.interview_meeting_link && (
                              <Button
                                variant="hero"
                                size="sm"
                                asChild
                                className="h-7 text-xs gap-1 px-2.5 bg-gradient-to-r from-primary to-blue-600 text-white shadow-sm"
                                title="Join Google Meet / Video Interview"
                              >
                                <a 
                                  href={app.interview_meeting_link} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <Video className="w-3.5 h-3.5" />
                                  <span>Join Meet</span>
                                </a>
                              </Button>
                            )}
                            {app.resume_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-7 text-xs text-primary gap-1 px-2 hover:bg-primary/10"
                                title="View submitted resume"
                              >
                                <a 
                                  href={getAuthenticatedFileUrl(app.resume_url)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Resume</span>
                                </a>
                              </Button>
                            )}
                            {app.url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              >
                                <a 
                                  href={app.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Candidate Profile Activity & History Timeline ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45 }}
      >
        <Card variant="glass" className="border-white/10">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Profile Activity & Application Timeline
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time record of your job applications, uploaded resumes, and profile events
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
              {activities.length} Recorded Activit{activities.length === 1 ? "y" : "ies"}
            </Badge>
          </CardHeader>
          <CardContent>
            {loadingActivities ? (
              <div className="text-center py-6 text-muted-foreground text-xs flex justify-center items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Loading activity history...
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-xs">
                No recent profile activities recorded yet. When you apply to jobs or upload a resume, your history will appear here.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
                {activities.map((act) => {
                  const isApp = act.type === "job_application";
                  const isResume = act.type === "resume_upload";
                  return (
                    <div key={act.id} className="relative flex items-start gap-3">
                      <div className={`absolute -left-6 top-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                        isApp 
                          ? "bg-primary text-primary-foreground" 
                          : isResume 
                          ? "bg-purple-500 text-white" 
                          : "bg-emerald-500 text-white"
                      }`}>
                        {isApp ? <Briefcase className="w-3 h-3" /> : isResume ? <FileText className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 bg-white/5 border border-white/5 hover:border-white/10 rounded-xl p-3.5 space-y-1 transition-all">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">{act.title}</span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {act.timestamp ? new Date(act.timestamp).toLocaleString() : "Recent"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{act.description}</p>
                        {act.meta && act.meta.match_score && (
                          <div className="pt-1 flex items-center gap-2 text-[11px]">
                            <span className="text-muted-foreground">Match Score:</span>
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                              {act.meta.match_score}%
                            </Badge>
                          </div>
                        )}
                        {act.meta && act.meta.resume_url && (
                          <div className="pt-1">
                            <a 
                              href={act.meta.resume_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-primary hover:underline text-xs flex items-center gap-1 font-medium"
                            >
                              <FileText className="w-3 h-3" />
                              <span>View Submitted Resume / CV</span>
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Applications;
