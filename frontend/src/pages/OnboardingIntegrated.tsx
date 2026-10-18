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
            <div className="w-24 h-24 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-xl shadow-primary/30">
              <Bot className="w-12 h-12 text-primary-foreground" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Welcome to AutoAgentHire!</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Let's set up your profile so our AI can start finding and applying to jobs for you automatically.
            </p>
            <div className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-medium mb-2">Full Name</label>
                <Input
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>
            <Button
              className="mt-8"
              variant="default"
              size="lg"
              onClick={nextStep}
              disabled={!formData.fullName || !formData.email}
            >
              Continue <ArrowRight className="w-5 h-5 ml-2" />
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
              <h2 className="text-3xl font-bold mb-2">Upload Your Resume</h2>
              <p className="text-muted-foreground">
                Our AI will extract your information and use it to match jobs and generate cover letters
              </p>
            </div>

            {!resumeData ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="relative border-2 border-dashed border-primary/30 rounded-2xl p-12 text-center hover:border-primary/60 transition-colors cursor-pointer bg-card/30"
              >
                {uploadResume.isPending ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center">
                      <FileText className="w-8 h-8 text-primary animate-pulse" />
                    </div>
                    <p className="text-foreground font-medium">{uploadedFile?.name}</p>
                    <p className="text-sm text-muted-foreground">Processing resume...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/20 flex items-center justify-center">
                      <Upload className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-lg font-medium mb-2">Drag & drop your resume here</p>
                    <p className="text-muted-foreground mb-4">or click to browse files</p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-sm text-muted-foreground">
                      <File className="w-4 h-4" />
                      PDF, DOCX, TXT (Max 5MB)
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
                <div className="flex items-center gap-4 p-4 rounded-xl bg-success/10 border border-success/30">
                  <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                    <Check className="w-6 h-6 text-success" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-success">Resume uploaded successfully!</p>
                    <p className="text-sm text-muted-foreground">{resumeData.filename}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {resumeData.text_length} characters extracted
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { setResumeData(null); setUploadedFile(null); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                {resumeData.summary && (
                  <div className="p-4 rounded-xl bg-card border">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="font-medium">AI Analysis</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{resumeData.summary}</p>
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
              <h2 className="text-3xl font-bold mb-2">Job Preferences</h2>
              <p className="text-muted-foreground">Tell us what kind of jobs you're looking for</p>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Job Keywords (comma separated)</label>
                <Input
                  placeholder="Software Engineer, Full Stack Developer, AI Engineer"
                  value={formData.jobKeywords.join(", ")}
                  onChange={(e) => setFormData({
                    ...formData,
                    jobKeywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                  })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Preferred Locations</label>
                <Input
                  placeholder="Remote, San Francisco, New York"
                  value={formData.preferredLocations.join(", ")}
                  onChange={(e) => setFormData({
                    ...formData,
                    preferredLocations: e.target.value.split(',').map(l => l.trim()).filter(Boolean)
                  })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Job Type</label>
                  <select
                    className="w-full p-2 rounded-md border bg-background"
                    value={formData.jobType}
                    onChange={(e) => setFormData({ ...formData, jobType: e.target.value as any })}
                  >
                    <option value="Remote">Remote</option>
                    <option value="On-site">On-site</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Any">Any</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Experience Level</label>
                  <select
                    className="w-full p-2 rounded-md border bg-background"
                    value={formData.experienceLevel}
                    onChange={(e) => setFormData({ ...formData, experienceLevel: e.target.value })}
                  >
                    <option value="Entry-level">Entry-level</option>
                    <option value="Mid-level">Mid-level</option>
                    <option value="Senior">Senior</option>
                    <option value="Lead">Lead</option>
                    <option value="Executive">Executive</option>
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
              <h2 className="text-3xl font-bold mb-2">Automation Settings</h2>
              <p className="text-muted-foreground">Customize how the AI applies to jobs</p>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Daily Application Limit: {formData.maxApplications}
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={formData.maxApplications}
                  onChange={(e) => setFormData({ ...formData, maxApplications: parseInt(e.target.value) })}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">Recommended: 20-30 applications per day</p>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border">
                <div>
                  <p className="font-medium">AI-Generated Cover Letters</p>
                  <p className="text-sm text-muted-foreground">Automatically create tailored cover letters</p>
                </div>
                <Checkbox
                  checked={formData.enableAICoverLetters}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableAICoverLetters: !!checked })}
                />
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border">
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">Get updates on applications</p>
                </div>
                <Checkbox
                  checked={formData.enableNotifications}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableNotifications: !!checked })}
                />
              </div>
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">AI Intelligence Engine Active</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Personalized cover letters and resume analysis are powered automatically by the backend Google Gemini LLM engine. No client API key setup is required.
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center max-w-lg mx-auto"
          >
            <div className="w-24 h-24 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-success to-green-400 flex items-center justify-center shadow-xl shadow-success/30">
              <Check className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-4">All Set!</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Your profile is complete. Our AI is ready to start finding and applying to jobs for you.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-8 text-left">
              <div className="p-4 rounded-xl bg-card border">
                <p className="text-sm text-muted-foreground mb-1">Resume</p>
                <p className="font-medium">✓ Uploaded</p>
              </div>
              <div className="p-4 rounded-xl bg-card border">
                <p className="text-sm text-muted-foreground mb-1">Preferences</p>
                <p className="font-medium">{formData.jobKeywords.length} keywords</p>
              </div>
              <div className="p-4 rounded-xl bg-card border">
                <p className="text-sm text-muted-foreground mb-1">Job Type</p>
                <p className="font-medium">{formData.jobType}</p>
              </div>
              <div className="p-4 rounded-xl bg-card border">
                <p className="text-sm text-muted-foreground mb-1">Daily Limit</p>
                <p className="font-medium">{formData.maxApplications} jobs</p>
              </div>
            </div>
            <Button variant="default" size="lg" onClick={handleComplete} className="w-full">
              Go to Dashboard <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 py-12 px-4">
      {/* Progress Bar */}
      <div className="max-w-4xl mx-auto mb-12">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isComplete = currentStep > step.id;
            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground scale-110"
                        : isComplete
                        ? "bg-success text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isComplete ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className="text-xs mt-2 hidden sm:block">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-12 sm:w-20 h-1 mx-2 transition-all ${
                      currentStep > step.id ? "bg-success" : "bg-muted"
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
          <Button variant="outline" onClick={prevStep}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button onClick={nextStep} disabled={!canProceed()}>
            {currentStep === 4 ? "Finish" : "Continue"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
