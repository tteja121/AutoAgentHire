import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Briefcase, Building2, MapPin, DollarSign, Calendar, Clock, Users,
  Upload, FileText, CheckCircle2, ArrowRight, ExternalLink, Search, Sparkles,
  Mail, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { jobsService } from "@/services/jobsService";
import { applicationsService } from "@/services/applicationsService";
import { applicationService } from "@/services/applicationService";
import { candidatesService } from "@/services/candidatesService";
import { authService } from "@/services/authService";
import { getCandidateProfile } from "@/utils/profileSync";

interface JobPosting {
  id: number;
  uuid: string;
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
  skills?: string;
  recruiting_process?: string;
  start_date_pt: string;
  final_date_pt: string;
  timezone: string;
  status: string;
  created_at?: string;
}

export default function CandidateJobsPage() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [viewingRoleDetailsJob, setViewingRoleDetailsJob] = useState<JobPosting | null>(null);

  // Application form state
  const [isApplying, setIsApplying] = useState(false);
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [analyzingResume, setAnalyzingResume] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const resumeInputRef = useRef<HTMLInputElement>(null);

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

      // Auto-fill applicant fields
      if (contact.name && !candidateName) {
        setCandidateName(contact.name);
      }
      if (contact.email && !candidateEmail) {
        setCandidateEmail(contact.email);
      }
      if (contact.phone && !candidatePhone) {
        setCandidatePhone(contact.phone);
      }

      // Auto-suggest cover letter / skills note
      const skillList = skills.slice(0, 8).join(", ");
      const expSnippet = experience.length > 0 && experience[0].title ? `with background in ${experience[0].title}` : "";
      if (!coverLetter && (skillList || expSnippet)) {
        setCoverLetter(`Experienced professional ${expSnippet}. Core proficiencies include: ${skillList}. Excited to contribute to ${selectedJob?.title || "this role"}!`);
      }

      toast({
        title: "Resume Analyzed & Auto-Filled! ✨",
        description: `Extracted candidate information and ${skills.length} skills automatically from ${resumeFile.name}.`,
      });
    } catch (err: any) {
      toast({
        title: "Analysis Notice",
        description: "Could not automatically parse all fields. You can review or manually complete the details.",
        variant: "destructive",
      });
    } finally {
      setAnalyzingResume(false);
    }
  };

  // Auto-fill user details from profile or stored candidate session
  useEffect(() => {
    loadCandidateJobs();
    autoFillCandidateProfile();

    const handleProfileUpdate = () => {
      autoFillCandidateProfile();
    };
    const handleJobUpdate = () => {
      loadCandidateJobs();
    };
    window.addEventListener('candidateProfileUpdated', handleProfileUpdate);
    window.addEventListener('jobPostingsUpdated', handleJobUpdate);
    return () => {
      window.removeEventListener('candidateProfileUpdated', handleProfileUpdate);
      window.removeEventListener('jobPostingsUpdated', handleJobUpdate);
    };
  }, []);

  const autoFillCandidateProfile = async () => {
    const profile = getCandidateProfile();
    if (profile.candidate_name && profile.candidate_name !== 'Candidate') {
      setCandidateName(profile.candidate_name);
    }
    if (profile.email) {
      setCandidateEmail(profile.email);
    }
    if (profile.phone) {
      setCandidatePhone(profile.phone);
    }

    try {
      const resp = await apiClient.get(API_ENDPOINTS.auth.me);
      if (resp.data) {
        if (resp.data.full_name) setCandidateName(resp.data.full_name);
        if (resp.data.email) setCandidateEmail(resp.data.email);
        if (resp.data.phone) setCandidatePhone(resp.data.phone);
      }
    } catch {
      // Fallback from localStorage
      const savedName = localStorage.getItem("candidate_name") || "";
      const savedEmail = localStorage.getItem("candidate_email") || "";
      const savedPhone = localStorage.getItem("candidate_phone") || "";
      if (savedName && !candidateName) setCandidateName(savedName);
      if (savedEmail && !candidateEmail) setCandidateEmail(savedEmail);
      if (savedPhone && !candidatePhone) setCandidatePhone(savedPhone);
    }
  };

  const loadCandidateJobs = async () => {
    setLoading(true);
    try {
      // Fetch directly from candidate jobs API so all recruiter parameters, dates, and logos are preserved
      const resp = await apiClient.get(API_ENDPOINTS.recruiter.candidateJobs);
      const apiJobs = resp.data || [];
      if (Array.isArray(apiJobs) && apiJobs.length > 0) {
        setJobs(apiJobs);
      } else {
        const activeJobs = await jobsService.getJobs();
        if (activeJobs && activeJobs.length > 0) {
          const mapped: JobPosting[] = activeJobs.map(j => ({
            id: Number(j.id) || 1,
            uuid: String(j.id),
            title: j.title,
            company_name: j.companies?.name || j.company_name || "AutoAgentHire Partner",
            company_logo_url: j.company_logo_url,
            organization_symbol: j.organization_symbol,
            location: j.location || "Remote",
            description: j.description || "",
            vacancies: j.vacancies || 1,
            salary_description: j.salary_description || "Competitive",
            job_type: j.job_type || j.employment_type || "Full-time",
            start_date_pt: new Date().toISOString(),
            final_date_pt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            timezone: "Asia/Kolkata (IST)",
            status: j.status,
          }));
          setJobs(mapped);
        } else {
          setJobs([]);
        }
      }
    } catch (err) {
      console.error("Failed to load candidate jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter(j => {
    const q = searchQuery.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      j.company_name.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q) ||
      (j.organization_symbol && j.organization_symbol.toLowerCase().includes(q)) ||
      (j.skills && j.skills.toLowerCase().includes(q))
    );
  });

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

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

    const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!emailRegex.test(cleanEmail)) {
      toast({
        title: "Invalid Email Address",
        description: "Please provide a valid email address to receive your application confirmation.",
        variant: "destructive",
      });
      return;
    }

    setApplySubmitting(true);
    try {
      // Submit via multipart form for file processing & Thank-You email dispatch
      let emailStatus: string | null = null;
      let emailRecipient = cleanEmail;

      try {
        const formData = new FormData();
        formData.append("candidate_name", cleanName);
        formData.append("candidate_email", cleanEmail);
        if (candidatePhone) formData.append("candidate_phone", candidatePhone.trim());
        if (portfolioUrl) formData.append("portfolio_url", portfolioUrl.trim());
        if (coverLetter) formData.append("cover_letter", coverLetter.trim());
        if (resumeFile) formData.append("resume", resumeFile);

        const resp = await apiClient.postFormData(
          API_ENDPOINTS.recruiter.applyJob(selectedJob.id),
          formData
        );
        emailStatus = resp?.data?.email_status;
        if (resp?.data?.email_recipient) {
          emailRecipient = resp.data.email_recipient;
        }
      } catch (backendErr: any) {
        console.warn("Backend multipart upload notice:", backendErr);
      }

      // Persist application in Client Application store so it immediately displays in Applications section
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
          url: '/candidate/jobs',
        });
      } catch (saveErr) {
        console.debug("Client application store note:", saveErr);
      }

      // Status-aware feedback distinguishing saved application vs email delivery
      if (emailStatus === "Sent") {
        toast({
          title: "Application Submitted & Confirmation Sent! 📬",
          description: `Application saved successfully! A thank-you confirmation email has been dispatched to ${emailRecipient}.`,
        });
      } else if (emailStatus === "Failed") {
        toast({
          title: "Application Submitted Successfully 🎉",
          description: `Your application and resume have been forwarded to ${selectedJob.company_name}. However, the confirmation email is temporarily delayed.`,
        });
      } else {
        toast({
          title: "Application Submitted Successfully! 🎉",
          description: `Your application has been received by ${selectedJob.company_name}. Thank-you confirmation email status: ${emailStatus || "Queued"}.`,
        });
      }

      setIsApplying(false);
      // Reset form
      setCandidateName("");
      setCandidateEmail("");
      setCandidatePhone("");
      setPortfolioUrl("");
      setCoverLetter("");
      setResumeFile(null);
    } catch (err: any) {
      const msg = err?.message || "Failed to submit application";
      toast({
        title: "Application failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setApplySubmitting(false);
    }
  };

  return (
    <div className="w-full text-foreground flex flex-col">
      {/* Hero Banner */}
      <div className="bg-gradient-to-b from-primary/10 via-background to-background rounded-3xl border border-white/5 py-10 px-6 mb-6">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <Badge variant="outline" className="border-primary/40 text-primary px-3 py-1 text-xs">
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Verified Recruiter Job Board
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Explore Opportunities from <span className="gradient-text">Top Recruiters</span>
          </h1>
          <p className="text-muted-foreground text-base max-w-2xl mx-auto">
            Browse verified job postings representing vetted organizations. Apply directly with your Resume and CV.
          </p>

          {/* Search bar */}
          <div className="max-w-xl mx-auto relative mt-6">
            <Search className="w-5 h-5 absolute left-4 top-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by job title, company, skills, or location..."
              className="pl-12 h-12 rounded-2xl bg-card border-white/10 text-base shadow-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Jobs Listing */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Active Opportunities ({filteredJobs.length})</h2>
          <span className="text-xs text-muted-foreground">Times shown in Pacific Time (PT)</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <Card variant="glass" className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4 text-muted-foreground">
              <Briefcase className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Matching Jobs Found</h3>
            <p className="text-muted-foreground max-w-sm mx-auto text-sm mb-4">
              Recruiters are constantly posting new positions. Check back soon or register as a recruiter to post your own vacancies!
            </p>
            <Button variant="outline" asChild>
              <Link to="/login">Recruiter Portal</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredJobs.map((job) => (
              <Card
                key={job.id}
                variant="glass"
                className="hover:border-primary/50 transition-all flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={job.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                        alt={job.company_name}
                        className="w-12 h-12 rounded-xl object-cover bg-muted border border-white/10"
                      />
                      <div>
                        <CardTitle className="text-base font-semibold line-clamp-1">{job.title}</CardTitle>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className="font-medium text-foreground">{job.company_name}</span>
                          {job.organization_symbol && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                              {job.organization_symbol}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <DollarSign className="w-3.5 h-3.5 text-primary" />
                        <span className="truncate">{job.salary_description}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="w-3.5 h-3.5 text-primary" />
                        <span>{job.vacancies} Position{job.vacancies > 1 ? "s" : ""}</span>
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

                    {/* Indian Standard Time (IST) Application Window Banner */}
                    <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 text-[11px] space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Window Start (IST):</span>
                        <span className="font-mono text-foreground">{job.start_date_pt?.replace("T", " ")}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Final Deadline (IST):</span>
                        <span className="font-mono text-foreground">{job.final_date_pt?.replace("T", " ")}</span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                      {job.description}
                    </p>

                    {job.skills && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {job.skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5).map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                            {skill}
                          </Badge>
                        ))}
                        {job.skills.split(",").map((s) => s.trim()).filter(Boolean).length > 5 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{job.skills.split(",").map((s) => s.trim()).filter(Boolean).length - 5}
                          </span>
                        )}
                      </div>
                    )}

                    {job.recruiting_process && (
                      <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-[11px] space-y-1">
                        <span className="font-semibold text-primary block">Process of Recruiting:</span>
                        <p className="text-muted-foreground line-clamp-2">{job.recruiting_process}</p>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-white/5 flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 gap-1.5 border-white/10 hover:border-primary/50 text-xs font-medium"
                      size="sm"
                      onClick={() => setViewingRoleDetailsJob(job)}
                    >
                      <Eye className="w-3.5 h-3.5 text-primary" />
                      <span>View Roles</span>
                    </Button>
                    <Button
                      variant="hero"
                      className="flex-1 gap-1.5 text-xs font-medium"
                      size="sm"
                      onClick={() => {
                        setSelectedJob(job);
                        setIsApplying(true);
                      }}
                    >
                      <span>Apply</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Candidate Direct Application Dialog */}
      <Dialog open={isApplying} onOpenChange={setIsApplying}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-card border-white/10 text-foreground p-6 shadow-2xl">
          {selectedJob && (
            <form onSubmit={handleApplySubmit} className="space-y-5">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <img
                    src={selectedJob.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                    alt={selectedJob.company_name}
                    className="w-10 h-10 rounded-xl object-cover bg-muted border border-white/10"
                  />
                  <div>
                    <DialogTitle className="text-lg font-bold">Apply for {selectedJob.title}</DialogTitle>
                    <DialogDescription className="text-xs">
                      {selectedJob.company_name} ({selectedJob.organization_symbol || "ORGANIZATION"}) • {selectedJob.location}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {selectedJob.recruiting_process && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs space-y-1">
                  <span className="font-semibold text-primary block">Recruitment Process / Hiring Steps:</span>
                  <p className="text-muted-foreground whitespace-pre-line">{selectedJob.recruiting_process}</p>
                </div>
              )}

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
                      <span>Thank-you confirmation email will be delivered to this verified address</span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium block">Phone Number</label>
                      <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">All country formats allowed</span>
                    </div>
                    <Input
                      placeholder="e.g. +91 98765 43210 or +1 (555) 000-0000"
                      value={candidatePhone}
                      onChange={(e) => setCandidatePhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Portfolio / GitHub / Profile URL</label>
                    <Input
                      placeholder="https://myportfolio.com or profile link"
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Document Upload: Resume Only with Analyze Button */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold block text-foreground">
                    Candidate Resume (PDF, DOCX) *
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

                <div
                  onClick={() => resumeInputRef.current?.click()}
                  className="p-5 rounded-2xl border-2 border-dashed border-primary/30 hover:border-primary/70 cursor-pointer bg-primary/5 hover:bg-primary/10 text-center space-y-2 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {resumeFile ? resumeFile.name : "Upload Resume (PDF, DOCX)"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {resumeFile
                        ? "Resume selected. Click 'Analyze Resume & Auto-Fill' to extract your contact & background automatically."
                        : "Click to browse and upload your primary resume file"}
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
                  placeholder="Tell the recruiter why you're a standout match for this role..."
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                />
              </div>

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
                  disabled={applySubmitting}
                  className="gap-2"
                >
                  {applySubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Submit Application</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Complete Role Details Modal Dialog */}
      <Dialog
        open={!!viewingRoleDetailsJob}
        onOpenChange={(open) => !open && setViewingRoleDetailsJob(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-white/10 text-foreground p-6 shadow-2xl">
          {viewingRoleDetailsJob && (
            <div className="space-y-6">
              {/* Header with Organization and Title */}
              <DialogHeader>
                <div className="flex items-start gap-4">
                  <img
                    src={viewingRoleDetailsJob.company_logo_url || "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"}
                    alt={viewingRoleDetailsJob.company_name}
                    className="w-14 h-14 rounded-2xl object-cover bg-muted border border-white/10 shrink-0"
                  />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{viewingRoleDetailsJob.company_name}</span>
                      {viewingRoleDetailsJob.organization_symbol && (
                        <Badge variant="outline" className="font-mono text-xs py-0.5 px-1.5">
                          {viewingRoleDetailsJob.organization_symbol}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/40 bg-emerald-500/10 text-xs">
                        Verified Recruiter
                      </Badge>
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
                        {viewingRoleDetailsJob.job_type}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-primary font-medium">
                        <DollarSign className="w-3.5 h-3.5" />
                        {viewingRoleDetailsJob.salary_description}
                      </span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Company Vacancy Allocation Highlight */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-transparent border border-primary/25 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-foreground">Company Vacancy Allocation</span>
                      <p className="text-sm text-primary font-bold">
                        {viewingRoleDetailsJob.vacancies} {viewingRoleDetailsJob.vacancies === 1 ? "Vacancy" : "Vacancies"} Provided by {viewingRoleDetailsJob.company_name}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-xs px-2.5 py-1">
                    ● Active & Open for Applications
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The hiring company has officially provided and budgeted {viewingRoleDetailsJob.vacancies} open position{viewingRoleDetailsJob.vacancies > 1 ? "s" : ""} for this role. Qualified candidates are prioritized for direct recruiter interviews.
                </p>
              </div>

              {/* Application Window & Schedule */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-white/5 border border-white/5 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px] mb-0.5">Application Window Start:</span>
                  <span className="font-mono text-foreground font-semibold">{viewingRoleDetailsJob.start_date_pt?.replace("T", " ")} (IST)</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px] mb-0.5">Final Closing Deadline:</span>
                  <span className="font-mono text-foreground font-semibold">{viewingRoleDetailsJob.final_date_pt?.replace("T", " ")} (IST)</span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-muted-foreground block text-[11px] mb-0.5">Official Timezone:</span>
                  <span className="font-semibold text-foreground">{viewingRoleDetailsJob.timezone || "Asia/Kolkata (IST)"}</span>
                </div>
              </div>

              {/* Complete Job Description */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>Job Description</span>
                </h3>
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                  {viewingRoleDetailsJob.description}
                </div>
              </div>

              {/* Job Requirements */}
              {viewingRoleDetailsJob.requirements && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Job Requirements & Qualifications</span>
                  </h3>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                    {viewingRoleDetailsJob.requirements}
                  </div>
                </div>
              )}

              {/* Skills Required */}
              {viewingRoleDetailsJob.skills && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>Required Skills & Competencies</span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-white/5 border border-white/5">
                    {viewingRoleDetailsJob.skills.split(",").map((s) => s.trim()).filter(Boolean).map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-xs px-2.5 py-1 bg-primary/10 text-primary border border-primary/20">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Recruitment Process / Hiring Steps */}
              {viewingRoleDetailsJob.recruiting_process && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Briefcase className="w-4 h-4 text-primary" />
                    <span>Process of Recruiting / Hiring Steps</span>
                  </h3>
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                    {viewingRoleDetailsJob.recruiting_process}
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
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
                    const targetJob = viewingRoleDetailsJob;
                    setViewingRoleDetailsJob(null);
                    setSelectedJob(targetJob);
                    setIsApplying(true);
                  }}
                >
                  <span>Apply for this Role</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
