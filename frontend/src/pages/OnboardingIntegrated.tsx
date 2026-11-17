/**
 * Onboarding Component - Integrated with Backend API
 * Collects user info, uploads resume, configures job automation
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Upload, FileText, Briefcase, Settings, Sparkles,
  Check, ArrowRight, ArrowLeft, X, File
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { useUploadResume } from "@/hooks/useJobAutomation";
import { useToast } from "@/hooks/use-toast";

const steps = [
  { id: 1, title: "Welcome", icon: Bot },
  { id: 2, title: "Upload Resume", icon: FileText },
  { id: 3, title: "Job Preferences", icon: Briefcase },
  { id: 4, title: "Settings", icon: Settings },
  { id: 5, title: "Complete", icon: Sparkles },
];

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resumeData, setResumeData] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const uploadResume = useUploadResume();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    jobKeywords: ["Software Engineer"],
    preferredLocations: ["Remote"],
    jobType: "Remote" as "Remote" | "On-site" | "Hybrid" | "Any",
    experienceLevel: "Mid-level",
    skills: [] as string[],
    maxApplications: 25,
    enableAICoverLetters: true,
    enableNotifications: true,
  });

  const handleFileUpload = async (file: File) => {
    if (!formData.email) {
      toast({
        title: "Email Required",
        description: "Please enter your email before uploading resume",
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);

    try {
      const result = await uploadResume.mutateAsync({
        file,
        email: formData.email,
      });

      setResumeData(result);

      toast({
        title: "Resume Processed",
        description: `${result.filename} uploaded and analyzed successfully`,
      });
    } catch (error) {
      setUploadedFile(null);
      console.error("Upload error:", error);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.pdf') || file.name.endsWith('.docx') || file.name.endsWith('.txt'))) {
      handleFileUpload(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please upload a PDF, DOCX, or TXT file",
        variant: "destructive",
      });
    }
  };

  const handleComplete = () => {
    localStorage.setItem('userProfile', JSON.stringify(formData));
    localStorage.setItem('resumeData', JSON.stringify(resumeData));
    if (resumeData?.file_path) {
      localStorage.setItem('resumePath', resumeData.file_path);
    }
    toast({
      title: "Setup Complete!",
      description: "Your profile is ready. Let's find your dream job!",
    });
    navigate('/dashboard');
  };

  const nextStep = () => { if (currentStep < 5) setCurrentStep(currentStep + 1); };
  const prevStep = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return !!(formData.fullName && formData.email);
      case 2: return uploadedFile !== null && resumeData !== null;
      case 3: return formData.jobKeywords.length > 0 && formData.preferredLocations.length > 0;
      case 4: return true;
      default: return true;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center max-w-lg mx-auto"
          >
            <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-[#123B32] flex items-center justify-center shadow-lg shadow-[#123B32]/10 border border-[#E6E5DC]">
              <Bot className="w-10 h-10 text-[#F7F5EF]" />
            </div>
            <h2 className="text-3xl md:text-4xl font-serif text-[#123B32] tracking-tight mb-4">Welcome to AutoAgentHire</h2>
            <p className="text-[#777D74] text-base leading-relaxed mb-8 font-sans">
              Set up your career preferences so our intelligent AI agents can curate and apply to high-match opportunities on your behalf.
            </p>
            <div className="space-y-4 text-left">
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#202722] mb-1.5 font-sans">Full Name</label>
                <Input
                  placeholder="e.g. Eleanor Vance"
                  className="bg-white border-[#E6E5DC] focus-visible:ring-[#123B32]"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#202722] mb-1.5 font-sans">Email Address</label>
                <Input
                  type="email"
                  placeholder="e.g. eleanor.vance@executive.ai"
                  className="bg-white border-[#E6E5DC] focus-visible:ring-[#123B32]"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>
            <Button
              className="mt-8 w-full bg-[#123B32] hover:bg-[#1b4e43] text-white"
              size="lg"
              onClick={nextStep}
              disabled={!formData.fullName || !formData.email}
            >
              Continue to Resume Analysis <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-2xl mx-auto"
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl font-serif text-[#123B32] tracking-tight mb-2">Upload Your Executive Resume</h2>
              <p className="text-[#777D74] text-sm">
                Our parsing engine extracts competencies, credentials, and experience telemetry for precision matching.
              </p>
            </div>

            {!resumeData ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="relative border-2 border-dashed border-[#E6E5DC] rounded-2xl p-12 text-center hover:border-[#123B32]/50 transition-colors cursor-pointer bg-white"
              >
                {uploadResume.isPending ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-[#123B32]/10 flex items-center justify-center">
                      <FileText className="w-8 h-8 text-[#123B32] animate-pulse" />
                    </div>
                    <p className="text-[#202722] font-medium">{uploadedFile?.name}</p>
                    <p className="text-sm text-[#777D74]">Extracting qualifications via AI engine...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#123B32]/10 flex items-center justify-center">
                      <Upload className="w-8 h-8 text-[#123B32]" />
                    </div>
                    <p className="text-base font-semibold text-[#202722] mb-1">Drag & drop your resume file</p>
                    <p className="text-xs text-[#777D74] mb-4">PDF, DOCX, or TXT supported (up to 10MB)</p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF8F3] border border-[#E6E5DC] text-xs text-[#777D74]">
                      <File className="w-3.5 h-3.5 text-[#123B32]" />
                      Verified Document Parsing
                    </div>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-5 rounded-2xl bg-[#123B32]/5 border border-[#123B32]/20">
                  <div className="w-12 h-12 rounded-xl bg-[#123B32] flex items-center justify-center">
                    <Check className="w-6 h-6 text-[#F7F5EF]" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[#123B32]">Resume Parsed Successfully</p>
                    <p className="text-xs text-[#777D74] font-mono">{resumeData.filename}</p>
                    <p className="text-xs text-[#777D74] mt-1">
                      {resumeData.text_length} characters indexed
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { setResumeData(null); setUploadedFile(null); }}>
                    <X className="w-4 h-4 text-[#777D74]" />
                  </Button>
                </div>
                {resumeData.summary && (
                  <div className="p-5 rounded-2xl bg-white border border-[#E6E5DC]">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-[#FF7058]" />
                      <span className="font-serif font-semibold text-sm text-[#123B32]">Executive Synthesis</span>
                    </div>
                    <p className="text-xs text-[#777D74] leading-relaxed">{resumeData.summary}</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        );

      case 3:
        return (
          <motion.div
            key="step3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-2xl mx-auto"
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl font-serif text-[#123B32] tracking-tight mb-2">Target Career Directives</h2>
              <p className="text-[#777D74] text-sm">Specify the roles, locations, and working models you want our AI agents to pursue.</p>
            </div>
            <div className="space-y-6 bg-white p-8 rounded-2xl border border-[#E6E5DC] shadow-sm">
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#202722] mb-1.5 font-sans">
                  Target Roles / Keywords (comma separated)
                </label>
                <Input
                  placeholder="e.g. Staff Software Engineer, Machine Learning Lead, Architect"
                  className="bg-[#FAF8F3] border-[#E6E5DC] focus-visible:ring-[#123B32]"
                  value={formData.jobKeywords.join(", ")}
                  onChange={(e) => setFormData({
                    ...formData,
                    jobKeywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                  })}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#202722] mb-1.5 font-sans">
                  Target Markets & Locations
                </label>
                <Input
                  placeholder="e.g. Remote, San Francisco, New York, London"
                  className="bg-[#FAF8F3] border-[#E6E5DC] focus-visible:ring-[#123B32]"
                  value={formData.preferredLocations.join(", ")}
                  onChange={(e) => setFormData({
                    ...formData,
                    preferredLocations: e.target.value.split(',').map(l => l.trim()).filter(Boolean)
                  })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#202722] mb-1.5 font-sans">
                    Work Arrangement
                  </label>
                  <select
                    className="w-full p-2.5 rounded-lg border border-[#E6E5DC] bg-[#FAF8F3] text-sm text-[#202722] focus:ring-1 focus:ring-[#123B32] outline-none"
                    value={formData.jobType}
                    onChange={(e) => setFormData({ ...formData, jobType: e.target.value as any })}
                  >
                    <option value="Remote">Remote Only</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="On-site">On-site</option>
                    <option value="Any">Any Arrangement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#202722] mb-1.5 font-sans">
                    Seniority Level
                  </label>
                  <select
                    className="w-full p-2.5 rounded-lg border border-[#E6E5DC] bg-[#FAF8F3] text-sm text-[#202722] focus:ring-1 focus:ring-[#123B32] outline-none"
                    value={formData.experienceLevel}
                    onChange={(e) => setFormData({ ...formData, experienceLevel: e.target.value })}
                  >
                    <option value="Entry-level">Entry-level</option>
                    <option value="Mid-level">Mid-level</option>
                    <option value="Senior">Senior</option>
                    <option value="Lead">Lead / Principal</option>
                    <option value="Executive">Executive / Director</option>
                  </select>
                </div>
              </div>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div
            key="step4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-2xl mx-auto"
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl font-serif text-[#123B32] tracking-tight mb-2">Autonomous Agent Settings</h2>
              <p className="text-[#777D74] text-sm">Tune the application volume, AI synthesis parameters, and verification alerts.</p>
            </div>
            <div className="space-y-6 bg-white p-8 rounded-2xl border border-[#E6E5DC] shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs uppercase tracking-wider font-semibold text-[#202722] font-sans">
                    Daily Submission Cadence
                  </label>
                  <span className="text-sm font-semibold text-[#123B32] bg-[#FAF8F3] px-2.5 py-0.5 rounded border border-[#E6E5DC]">
                    {formData.maxApplications} applications / day
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={formData.maxApplications}
                  onChange={(e) => setFormData({ ...formData, maxApplications: parseInt(e.target.value) })}
                  className="w-full accent-[#123B32] cursor-pointer"
                />
                <p className="text-xs text-[#777D74] mt-1.5">Recommended: 20–30 applications daily for optimal ATS matching rates.</p>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-[#E6E5DC] bg-[#FAF8F3]">
                <div>
                  <p className="font-semibold text-sm text-[#202722]">AI-Tailored Cover Letters</p>
                  <p className="text-xs text-[#777D74]">Dynamically align achievements with each job specification.</p>
                </div>
                <Checkbox
                  checked={formData.enableAICoverLetters}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableAICoverLetters: !!checked })}
                />
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-[#E6E5DC] bg-[#FAF8F3]">
                <div>
                  <p className="font-semibold text-sm text-[#202722]">Dispatch Notifications</p>
                  <p className="text-xs text-[#777D74]">Receive instant alerts when interviews and application milestones are recorded.</p>
                </div>
                <Checkbox
                  checked={formData.enableNotifications}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableNotifications: !!checked })}
                />
              </div>
              <div className="p-4 rounded-xl border border-[#123B32]/20 bg-[#123B32]/5 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[#FF7058] mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[#123B32] uppercase tracking-wider">AI Intelligence Engine Active</p>
                  <p className="text-xs text-[#777D74] leading-relaxed">
                    Personalized cover letters and resume analysis are powered automatically by the backend Google Gemini LLM engine.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        );

      case 5:
        return (
          <motion.div
            key="step5"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center max-w-lg mx-auto"
          >
            <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-[#123B32] flex items-center justify-center shadow-xl shadow-[#123B32]/10 border border-[#E6E5DC]">
              <Check className="w-10 h-10 text-[#F7F5EF]" />
            </div>
            <h2 className="text-3xl font-serif text-[#123B32] tracking-tight mb-4">Profile Established</h2>
            <p className="text-[#777D74] text-sm leading-relaxed mb-8">
              Your career directives are locked. AutoAgentHire's intelligent agents are ready to scan, match, and orchestrate verified opportunities.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-8 text-left font-sans">
              <div className="p-4 rounded-xl bg-white border border-[#E6E5DC]">
                <p className="text-[11px] uppercase tracking-wider text-[#777D74] font-semibold mb-1">Resume</p>
                <p className="font-semibold text-xs text-[#123B32] flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Uploaded & Indexed
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white border border-[#E6E5DC]">
                <p className="text-[11px] uppercase tracking-wider text-[#777D74] font-semibold mb-1">Keywords</p>
                <p className="font-semibold text-xs text-[#202722]">{formData.jobKeywords.length} targets active</p>
              </div>
              <div className="p-4 rounded-xl bg-white border border-[#E6E5DC]">
                <p className="text-[11px] uppercase tracking-wider text-[#777D74] font-semibold mb-1">Work Model</p>
                <p className="font-semibold text-xs text-[#202722]">{formData.jobType}</p>
              </div>
              <div className="p-4 rounded-xl bg-white border border-[#E6E5DC]">
                <p className="text-[11px] uppercase tracking-wider text-[#777D74] font-semibold mb-1">Daily Cadence</p>
                <p className="font-semibold text-xs text-[#202722]">{formData.maxApplications} jobs / day</p>
              </div>
            </div>
            <Button
              className="w-full bg-[#123B32] hover:bg-[#1b4e43] text-white h-11"
              size="lg"
              onClick={handleComplete}
            >
              Enter Intelligence Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F5EF] py-12 px-4">
      {/* Progress Bar */}
      <div className="max-w-3xl mx-auto mb-12">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isComplete = currentStep > step.id;
            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? "bg-[#123B32] text-[#F7F5EF] shadow-md ring-4 ring-[#123B32]/10 scale-105"
                        : isComplete
                        ? "bg-[#A9BBA7] text-[#123B32]"
                        : "bg-white border border-[#E6E5DC] text-[#777D74]"
                    }`}
                  >
                    {isComplete ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-[11px] uppercase tracking-wider font-semibold mt-2 hidden sm:block ${
                    isActive ? "text-[#123B32]" : "text-[#777D74]"
                  }`}>
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-10 sm:w-16 h-0.5 mx-2 transition-all ${
                      currentStep > step.id ? "bg-[#123B32]" : "bg-[#E6E5DC]"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>

      {/* Navigation */}
      {currentStep > 1 && currentStep < 5 && (
        <div className="max-w-2xl mx-auto mt-8 flex items-center justify-between">
          <Button
            variant="outline"
            className="border-[#E6E5DC] bg-white hover:bg-[#FAF8F3] text-[#202722]"
            onClick={prevStep}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button
            className="bg-[#123B32] hover:bg-[#1b4e43] text-white"
            onClick={nextStep}
            disabled={!canProceed()}
          >
            {currentStep === 4 ? "Complete Setup" : "Continue"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
