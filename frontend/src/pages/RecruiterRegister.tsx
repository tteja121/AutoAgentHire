import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Briefcase, Building2, Mail, Lock, User, Eye, EyeOff,
  ArrowRight, ShieldCheck, CheckCircle2, Clock, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { authService } from "@/services/authService";
import { companiesService } from "@/services/companiesService";

export default function RecruiterRegister() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    companyName: "",
    password: "",
    confirmPassword: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.companyName.trim()) {
      setError("Please provide your Official Company / Organization Name.");
      return;
    }

    // Official company email domain check (disallow personal providers)
    if (authService.isPersonalEmail(formData.email)) {
      const domain = formData.email.split('@')[1] || 'personal provider';
      setError(
        `Recruiters must register with an official corporate email address. Personal emails (@${domain}) are not permitted. Please use your organization email.`
      );
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/;
    if (!pwRegex.test(formData.password)) {
      setError(
        "Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 digit, and 1 special character."
      );
      return;
    }

    setIsLoading(true);
    try {
      const signUpResult = await authService.signUp({
        email: formData.email,
        password: formData.password,
        fullName: formData.name,
        role: "recruiter",
        companyName: formData.companyName,
      });

      if (signUpResult.custom_user_id) {
        setAssignedUserId(signUpResult.custom_user_id);
      }

      if (signUpResult.user) {
        await companiesService.createCompany({
          name: formData.companyName,
          owner_id: signUpResult.user.id,
        });
      }

      // Show dedicated status view
      setIsSubmitted(true);
    } catch (err: any) {
      const detail = err?.message || "Recruiter registration failed. Please try again.";
      setError(detail);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-navy-800 to-background items-center justify-center p-12 overflow-hidden border-r border-white/5">
        <div className="absolute inset-0 floating-particles opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-blue-500/20 rounded-full blur-[100px]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center max-w-md"
        >
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center shadow-xl shadow-primary/30">
            <Briefcase className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-3">Hire Top Talent with AI</h2>
          <p className="text-muted-foreground leading-relaxed">
            Submit a recruiter registration request for your organization. Once approved by the Authorizer, post vacancies, track applications, and inspect candidate CVs seamlessly.
          </p>

          <div className="mt-8 p-4 rounded-2xl bg-white/5 border border-white/10 text-left text-xs space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Permission-Based Recruiter Authentication</span>
            </div>
            <div className="flex items-center gap-2 text-blue-400 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>Pacific Time (PT) Automated Vacancy Deadlines</span>
            </div>
            <div className="flex items-center gap-2 text-primary font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>Candidate CV & Resume Inspection Access</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right side form or success confirmation */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center text-white">
              <Briefcase className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">AutoAgentHire</span>
          </Link>

          {isSubmitted ? (
            /* Request Sent Confirmation */
            <div className="space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-2">
                <ShieldCheck className="w-8 h-8" />
              </div>

              <div>
                <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 mb-2 text-xs">
                  Request Sent to Authorizer
                </Badge>
                <h1 className="text-2xl font-bold tracking-tight">
                  Registration Request Submitted!
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Your recruiter registration request has been forwarded to the Authorizer interface for verification.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/30 border border-white/5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Organization:</span>
                  <span className="font-semibold text-foreground">{formData.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recruiter:</span>
                  <span className="font-semibold text-foreground">{formData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Official Email:</span>
                  <span className="font-mono text-foreground">{formData.email}</span>
                </div>
                {assignedUserId && (
                  <div className="flex justify-between items-center py-1 px-2 rounded-lg bg-primary/10 border border-primary/20">
                    <span className="text-primary font-semibold">Assigned User ID:</span>
                    <span className="font-mono font-bold text-sm text-primary">{assignedUserId}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-white/5">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Pending Authorizer Permission
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 leading-relaxed">
                <strong>Next Step:</strong> Recruiter accounts cannot log in immediately. As soon as the Authorizer reviews and approves your request, your login access will be granted.
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                <Button
                  onClick={() => navigate("/login?pending_approval=1")}
                  variant="hero"
                  className="w-full gap-2"
                >
                  Go to Sign In
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="w-full"
                >
                  Return to Home
                </Button>
              </div>
            </div>
          ) : (
            /* Recruiter Request Form */
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                Recruiter Request Form
              </div>

              <h1 className="text-3xl font-bold mb-2">Request Recruiter Access</h1>
              <p className="text-muted-foreground mb-6 text-sm">
                Submit a registration request. An authorizer will review your request before granting login access.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1.5">Official Organization / Company Name *</label>
                  <Input
                    placeholder="e.g. Acme Corp, Tech Innovations LLC"
                    icon={<Building2 className="w-4 h-4" />}
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Recruiter Full Name *</label>
                  <Input
                    placeholder="e.g. Sarah Jenkins"
                    icon={<User className="w-4 h-4" />}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Official Work / Corporate Email *</label>
                  <Input
                    type="email"
                    placeholder="sarah@company.com"
                    icon={<Mail className="w-4 h-4" />}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                  <span className="text-xs text-muted-foreground mt-1 block">
                    Use your official company email address
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Password *</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a strong password"
                      icon={<Lock className="w-4 h-4" />}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Confirm Password *</label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    icon={<Lock className="w-4 h-4" />}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full mt-2"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Send Request to Authorizer
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-center text-muted-foreground mt-6 text-sm">
                Already approved?{" "}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Sign In
                </Link>
              </p>

              <p className="text-center text-xs text-muted-foreground mt-2">
                Are you a candidate looking for jobs?{" "}
                <Link to="/signup" className="text-primary hover:underline">
                  Create Candidate Account
                </Link>
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
