import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Briefcase, Building2, Mail, Lock, User, Eye, EyeOff,
  ArrowRight, ArrowLeft, ShieldCheck, CheckCircle2, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

    if (authService.isPersonalEmail(formData.email)) {
      const domain = formData.email.split("@")[1] || "personal provider";
      setError(
        `Recruiters must register with an official corporate email address. Personal emails (@${domain}) are not permitted. Please use your organization email.`
      );
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]).{8,}$/;
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

      setIsSubmitted(true);
    } catch (err: any) {
      const detail = err?.message || "Recruiter registration failed. Please try again.";
      setError(detail);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F7F5EF] text-[#202722]">
      {/* Left Column - Editorial Identity Pane */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#123B32] text-[#F7F5EF] items-center justify-center p-12 overflow-hidden border-r border-[#123B32]/30">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        
        <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-[#FF7058]/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/4 w-72 h-72 bg-[#A9BBA7]/15 rounded-full blur-[100px]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-left max-w-lg"
        >
          <div className="w-12 h-12 rounded-xl bg-[#FF7058] flex items-center justify-center text-white mb-8 shadow-sm">
            <Briefcase className="w-6 h-6" />
          </div>

          <span className="text-xs uppercase tracking-widest text-[#FF7058] font-bold block mb-3">
            Enterprise Talent Partner
          </span>

          <h2 className="font-serif text-4xl lg:text-5xl font-normal tracking-tight text-white mb-6 leading-tight">
            Source Calibrated Engineering Talent.
          </h2>

          <p className="text-[#A9BBA7] text-sm sm:text-base leading-relaxed mb-8 font-sans">
            Submit a verified recruiter requisition request. Once reviewed by organizational Authorizers, post structured roles, receive pre-screened applicant scores, and schedule interviews.
          </p>

          <div className="p-5 rounded-xl bg-white/[0.04] border border-white/10 space-y-3 text-xs text-[#E6E5DC]">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-[#FF7058]" />
              <span>Permission-governed recruiter access & official domain validation</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#A9BBA7]" />
              <span>Pre-scored candidate profiles & direct resume/CV inspection</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right Column - Registration Request Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-6"
        >
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#777D74] hover:text-[#123B32] transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Return to Platform</span>
            </Link>
          </div>

          {isSubmitted ? (
            <div className="space-y-6">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-2">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div>
                <Badge variant="outline" className="border-amber-300 text-amber-900 bg-amber-50 mb-2 text-xs">
                  Awaiting Authorizer Review
                </Badge>
                <h1 className="font-serif text-3xl font-normal text-[#123B32]">
                  Request Submitted
                </h1>
                <p className="text-xs sm:text-sm text-[#777D74] mt-1.5 leading-relaxed">
                  Your corporate recruiter request has been forwarded to the Authorizer verification queue.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white border border-[#E6E5DC] space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#777D74]">Organization:</span>
                  <span className="font-semibold text-[#123B32]">{formData.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#777D74]">Recruiter:</span>
                  <span className="font-semibold text-[#123B32]">{formData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#777D74]">Official Email:</span>
                  <span className="font-mono text-[#202722]">{formData.email}</span>
                </div>
                {assignedUserId && (
                  <div className="flex justify-between items-center py-1 px-2.5 rounded bg-[#123B32]/5 border border-[#123B32]/15">
                    <span className="text-[#123B32] font-semibold">Assigned User ID:</span>
                    <span className="font-mono font-bold text-xs text-[#123B32]">{assignedUserId}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-[#E6E5DC]">
                  <span className="text-[#777D74]">Status:</span>
                  <span className="text-amber-800 font-semibold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-600" />
                    Pending Authorizer Approval
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                <strong>Next Step:</strong> As soon as the authorizer verifies your organization credentials, your login will be authorized.
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={() => navigate("/login?pending_approval=1")}
                  className="w-full bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] text-xs uppercase tracking-wider font-semibold py-3"
                >
                  Go to Sign In
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="w-full border-[#E6E5DC] text-xs uppercase tracking-wider font-semibold py-3"
                >
                  Return to Home
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-3">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified Corporate Access</span>
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#123B32]">
                Recruiter Access
              </h1>
              <p className="text-xs sm:text-sm text-[#777D74] mt-1.5 mb-6">
                Submit your official corporate credentials for organizational authorization.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs leading-relaxed">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    Official Organization / Company Name *
                  </label>
                  <Input
                    placeholder="e.g. Acme Corp, Tech Innovations LLC"
                    className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11"
                    icon={<Building2 className="w-4 h-4 text-[#777D74]" />}
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    Recruiter Full Name *
                  </label>
                  <Input
                    placeholder="e.g. Sarah Jenkins"
                    className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11"
                    icon={<User className="w-4 h-4 text-[#777D74]" />}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    Official Corporate Email *
                  </label>
                  <Input
                    type="email"
                    placeholder="sarah@company.com"
                    className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11"
                    icon={<Mail className="w-4 h-4 text-[#777D74]" />}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                  <span className="text-[11px] text-[#777D74] mt-1 block">
                    Personal emails (@gmail, @yahoo, etc.) are restricted.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    Password *
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 8 chars with 1 upper, 1 lower, 1 digit, 1 special"
                      className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11 pr-10"
                      icon={<Lock className="w-4 h-4 text-[#777D74]" />}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777D74] hover:text-[#123B32] p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    Confirm Password *
                  </label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11"
                    icon={<Lock className="w-4 h-4 text-[#777D74]" />}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] font-semibold h-11 rounded-lg text-xs tracking-wider uppercase shadow-sm mt-2"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <span>Send Request to Authorizer</span>
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>

              <div className="pt-4 text-center text-xs text-[#777D74] space-y-2 border-t border-[#E6E5DC] mt-6">
                <p>
                  Already authorized?{" "}
                  <Link to="/login" className="text-[#123B32] hover:underline font-semibold">
                    Sign in to Recruiter Workspace
                  </Link>
                </p>
                <p>
                  Candidate?{" "}
                  <Link to="/signup" className="text-[#FF7058] hover:underline font-semibold">
                    Create Candidate Account
                  </Link>
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
