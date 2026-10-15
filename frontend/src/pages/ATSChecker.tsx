import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import ResumeUploadPanel from "@/components/ATS/ResumeUploadPanel";
import JobDescriptionPanel from "@/components/ATS/JobDescriptionPanel";
import ATSScoreCard from "@/components/ATS/ATSScoreCard";
import KeywordMatchTable from "@/components/ATS/KeywordMatchTable";
import CoverLetterPanel from "@/components/ATS/CoverLetterPanel";
import { ArrowLeft, Sparkles, Briefcase, Building2, MapPin, DollarSign, ExternalLink, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE_URL } from "@/lib/api";
import { applyProfileFromResume } from "@/utils/profileSync";

interface MatchedPlatformJob {
  id: number;
  title: string;
  company_name: string;
  location: string;
  salary_description?: string;
  matching_skills_count: number;
  matched_skills?: string[];
  description: string;
}

interface ATSResult {
  score: number;
  match_score?: number;
  matched_keywords: string[];
  missing_keywords: string[];
  matched_skills: string[];
  extracted_skills?: string[];
  suggestions: string[];
  resume_text?: string;
  job_description?: string;
  suitable_job_title?: string;
  auto_generated?: boolean;
  matched_platform_jobs?: MatchedPlatformJob[];
}

const ATSChecker = () => {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAutoGeneratingJD, setIsAutoGeneratingJD] = useState(false);
  const [result, setResult] = useState<ATSResult | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleAutoDetectJD = async () => {
    if (!resumeFile) {
      toast({
        title: "Upload Resume First",
        description: "Please upload your resume to detect suitable job descriptions.",
        variant: "destructive",
      });
      return;
    }

    setIsAutoGeneratingJD(true);
    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      const resp = await fetch(`${API_BASE_URL}/api/ats/suggest-jd`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        throw new Error("Failed to detect suitable job description");
      }

      const data = await resp.json();
      setJobDescription(data.job_description);
      toast({
        title: "✨ Job Description Matched!",
        description: `Generated suitable job description for: ${data.job_title}`,
      });
    } catch (err: any) {
      toast({
        title: "Auto-detection failed",
        description: err.message || "Could not detect job description from resume.",
        variant: "destructive",
      });
    } finally {
      setIsAutoGeneratingJD(false);
    }
  };

  const handleAnalyze = async () => {
    if (!resumeFile) {
      toast({
        title: "Missing Resume",
        description: "Please upload your resume first",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      if (jobDescription.trim()) {
        formData.append("job_description", jobDescription);
      }

      const response = await fetch(`${API_BASE_URL}/api/ats/match`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ATSResult = await response.json();
      setResult(data);

      // Apply extracted details across entire candidate profile everywhere in the site
      applyProfileFromResume(data, resumeFile.name);

      if (data.job_description && !jobDescription.trim()) {
        setJobDescription(data.job_description);
      }

      const displayScore = data.score || data.match_score || 0;
      
      // Save analyzed resume match results for Applications section in Client Portal
      try {
        sessionStorage.setItem("latest_ats_analysis", JSON.stringify({
          score: displayScore,
          suitable_job_title: data.suitable_job_title || "Target Role",
          extracted_skills: data.extracted_skills || data.matched_skills || [],
          job_description: data.job_description || "",
          matched_platform_jobs: data.matched_platform_jobs || [],
          timestamp: new Date().toISOString(),
        }));
      } catch (storageErr) {
        console.error("Session storage error:", storageErr);
      }

      toast({
        title: data.auto_generated ? "✅ Matched & Analyzed!" : "✅ Analysis Complete!",
        description: data.auto_generated
          ? `Matched with ${data.suitable_job_title || "suitable role"} (${displayScore}%). Redirecting to Applications...`
          : `Your ATS score is ${displayScore}%. Redirecting to Applications...`,
      });

      // Redirect to Application section in Client portal and show related job posts
      setTimeout(() => {
        navigate("/dashboard/applications", {
          state: {
            fromAnalysis: true,
            score: displayScore,
            suitable_job_title: data.suitable_job_title || "Target Role",
            extracted_skills: data.extracted_skills || data.matched_skills || [],
            job_description: data.job_description || "",
            matched_platform_jobs: data.matched_platform_jobs || [],
          },
        });
      }, 1200);
    } catch (error: any) {
      console.error("ATS analysis error:", error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze resume. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setResumeFile(null);
    setJobDescription("");
    setResult(null);
    setCoverLetter("");
  };

  const handleGenerateCoverLetter = async () => {
    const effectiveJD = jobDescription || result?.job_description;
    if (!result?.resume_text || !effectiveJD) {
      toast({
        title: "Missing Information",
        description: "Resume and job description are required",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingCoverLetter(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/cover-letter/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resume_text: result.resume_text,
          job_description: effectiveJD,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || "Failed to generate cover letter");
      }

      const data = await response.json();
      setCoverLetter(data.cover_letter);

      toast({
        title: "✨ Cover Letter Generated!",
        description: "Your personalized cover letter is ready",
      });
    } catch (error: any) {
      console.error("Cover letter generation error:", error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate cover letter. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleCopyCoverLetter = () => {
    navigator.clipboard.writeText(coverLetter);
    toast({
      title: "Copied!",
      description: "Cover letter copied to clipboard",
    });
  };

  const handleDownloadCoverLetter = () => {
    const blob = new Blob([coverLetter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cover-letter.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Downloaded!",
      description: "Cover letter saved successfully",
    });
  };

  return (
    <div className="w-full text-foreground space-y-6">
      {/* Title & Action Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-primary/10 via-card to-card border border-white/5 shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-primary to-blue-500 rounded-2xl text-white shadow-lg shadow-primary/25">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ATS Resume Checker</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload your resume — automatically analyzes keyword matching & generates suitable job descriptions
            </p>
          </div>
        </div>
        {result && (
          <Button
            onClick={handleReset}
            variant="outline"
            size="sm"
            className="border-white/10 hover:bg-white/5 text-xs self-start sm:self-auto"
          >
            New Analysis
          </Button>
        )}
      </div>

      <div className="container mx-auto px-6 py-8">
        {!result ? (
          /* Input Phase */
          <div className="space-y-6 max-w-6xl mx-auto">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-purple-500/10 to-blue-500/10 border border-primary/20 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Automatic Skill-Based Job Detection</h3>
                  <p className="text-xs text-muted-foreground">
                    Just upload your resume and click <strong>Analyze Resume</strong>. Our AI will automatically analyze your skills and match a suitable job description!
                  </p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <ResumeUploadPanel
                file={resumeFile}
                onFileChange={setResumeFile}
                onAnalyze={handleAnalyze}
                isAnalyzing={isAnalyzing}
              />
              <JobDescriptionPanel
                value={jobDescription}
                onChange={setJobDescription}
                onAutoGenerate={handleAutoDetectJD}
                isAutoGenerating={isAutoGeneratingJD}
                hasResume={!!resumeFile}
              />
            </div>
          </div>
        ) : (
          /* Results Phase */
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Suitable Matched Job Description Card */}
            {(result.suitable_job_title || result.job_description) && (
              <Card variant="glass" className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold">
                        <Briefcase className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[10px]">
                            {result.auto_generated ? "Auto-Matched from Resume Skills" : "Target Job Profile"}
                          </Badge>
                        </div>
                        <CardTitle className="text-lg font-bold mt-1">
                          {result.suitable_job_title || "Suitable Target Role"}
                        </CardTitle>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="text-xs border-primary/30 hover:bg-primary/10 gap-1.5"
                    >
                      <Link to="/candidate/jobs">
                        <span>Browse Available Jobs</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
                      Matched Technical Skills in Resume
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(result.extracted_skills || result.matched_skills).map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-xs capitalize">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {result.job_description && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
                        Generated / Matched Job Description
                      </h4>
                      <div className="p-3.5 rounded-xl bg-card border border-white/5 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto font-mono">
                        {result.job_description}
                      </div>
                    </div>
                  )}

                  {/* Active Platform Jobs Matched */}
                  {result.matched_platform_jobs && result.matched_platform_jobs.length > 0 && (
                    <div className="pt-3 border-t border-white/5 space-y-2">
                      <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-primary" />
                        Active Platform Job Vacancies Matching Your Profile:
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {result.matched_platform_jobs.map((job) => (
                          <div key={job.id} className="p-3 rounded-xl bg-card border border-white/5 flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-xs text-foreground">{job.title}</p>
                              <p className="text-[11px] text-muted-foreground">{job.company_name} • {job.location}</p>
                              {job.salary_description && (
                                <p className="text-[10px] text-primary">{job.salary_description}</p>
                              )}
                            </div>
                            <Button size="sm" variant="ghost" asChild className="text-xs h-7">
                              <Link to="/candidate/jobs">View</Link>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Score Overview */}
            <div className="grid md:grid-cols-3 gap-6">
              <ATSScoreCard score={Math.round(result.score || result.match_score || 0)} />
              
              <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
                <h4 className="text-sm text-muted-foreground font-medium mb-2">Keyword Match</h4>
                <p className="text-3xl font-bold text-primary">
                  {result.matched_keywords.length > 0 
                    ? Math.round((result.matched_keywords.length / (result.matched_keywords.length + result.missing_keywords.length)) * 100)
                    : 0}%
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.matched_keywords.length} / {result.matched_keywords.length + result.missing_keywords.length} keywords
                </p>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
                <h4 className="text-sm text-muted-foreground font-medium mb-2">Skills Match</h4>
                <p className="text-3xl font-bold text-primary">
                  {result.matched_skills.length}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Technical skills matched
                </p>
              </div>
            </div>

            {/* Keyword Analysis */}
            <KeywordMatchTable
              matchedKeywords={result.matched_keywords}
              missingKeywords={result.missing_keywords}
              matchedSkills={result.matched_skills}
              suggestions={result.suggestions}
            />

            {/* Cover Letter Section */}
            {!coverLetter && !isGeneratingCoverLetter && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={handleGenerateCoverLetter}
                  size="lg"
                  className="bg-gradient-to-r from-primary to-primary/60 hover:from-primary/90 hover:to-primary/70"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generate AI Cover Letter for This Job
                </Button>
              </div>
            )}

            {isGeneratingCoverLetter && (
              <div className="flex items-center justify-center p-8 bg-card border border-border rounded-xl">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Generating tailored cover letter...</p>
                </div>
              </div>
            )}

            {coverLetter && (
              <CoverLetterPanel
                coverLetter={coverLetter}
                onChange={setCoverLetter}
                onCopy={handleCopyCoverLetter}
                onDownload={handleDownloadCoverLetter}
                isLoading={isGeneratingCoverLetter}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ATSChecker;
