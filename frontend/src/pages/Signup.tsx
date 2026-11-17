import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Mail, Lock, User, Eye, EyeOff, ArrowRight, ArrowLeft,
  KeyRound, RotateCw, CheckCircle2, Sparkles, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { authService } from "@/services/authService";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

const Signup = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);

  // OTP Verification States
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [otpPreview, setOtpPreview] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    agreeTerms: false,
  });

  // Countdown timer for OTP resend
  useEffect(() => {
    let timer: any;
    if (isOtpStep && resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isOtpStep, resendCooldown]);

  // Handle pre-filled email from login or URL redirect (?email=...&verify=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    const verifyParam = params.get("verify");
    if (emailParam) {
      setFormData((prev) => ({ ...prev, email: emailParam }));
      if (verifyParam === "1") {
        setIsOtpStep(true);
      }
    } else {
      setFormData({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        agreeTerms: false,
      });
    }
    setError(null);
  }, []);

  const handleGoogleTokenSuccess = async (accessToken: string) => {
    setGoogleLoading(true);
    setError(null);
    try {
      const result = await authService.signInWithGoogleToken(accessToken);
      const role = result?.role || "candidate";
      if (role === "authorizer") {
        navigate("/authorizer");
      } else if (role === "recruiter") {
        navigate("/recruiter");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      console.error("[Google Sign-Up Error]:", err);
      setError(err?.message || "Google sign-up failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleError = (errorMsg: string) => {
    setError(errorMsg);
    setGoogleLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
      const res = await authService.signUp({
        email: formData.email,
        password: formData.password,
        fullName: formData.name,
        role: "candidate",
      });

      if (res?.requires_otp) {
        setIsOtpStep(true);
        setOtpError(null);
        setResendCooldown(60);
        if (res?.otp_preview) {
          setOtpPreview(res.otp_preview);
        }
        if (res.email_sent === false) {
          setOtpError(
            "Account created, but verification email could not be delivered immediately. Please click 'Resend Code' or verify your email provider."
          );
          setResendSuccess(null);
        } else {
          setResendSuccess(
            "A 6-digit verification code has been dispatched to your email address. Please check your inbox and spam folder."
          );
        }
      } else {
        setIsSubmittedSuccess(true);
      }
    } catch (err: any) {
      const msg = err?.message || "Signup failed. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length < 6) {
      setOtpError("Please enter the complete 6-digit verification code.");
      return;
    }

    setOtpLoading(true);
    setOtpError(null);

    try {
      await authService.verifySignupOtp(formData.email, otpCode);
      navigate("/dashboard");
    } catch (err: any) {
      setOtpError(
        err?.message || "Invalid verification code. Please check your email and try again."
      );
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setOtpError(null);
    setResendSuccess(null);

    try {
      const res = await authService.resendSignupOtp(formData.email);
      setResendCooldown(60);
      if (res?.otp_preview) {
        setOtpPreview(res.otp_preview);
      }
      setResendSuccess("A fresh 6-digit verification code has been dispatched to your email.");
    } catch (err: any) {
      setOtpError(err?.message || "Failed to resend verification code. Please wait before retrying.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F7F5EF] text-[#202722]">
      {/* Left Column - Editorial Hero Pane */}
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
            <Sparkles className="w-6 h-6" />
          </div>

          <span className="text-xs uppercase tracking-widest text-[#FF7058] font-bold block mb-3">
            Candidate Onboarding
          </span>

          <h2 className="font-serif text-4xl lg:text-5xl font-normal tracking-tight text-white mb-6 leading-tight">
            Claim Your Intelligent Advantage.
          </h2>

          <p className="text-[#A9BBA7] text-sm sm:text-base leading-relaxed mb-8 font-sans">
            Register to calibrate your resume with precision ATS diagnostics, discover verified engineering requisitions, and deploy autonomous job search agents.
          </p>

          <div className="p-5 rounded-xl bg-white/[0.04] border border-white/10 space-y-3 text-xs text-[#E6E5DC]">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#FF7058]" />
              <span>Instant ATS diagnostic & keyword alignment scoring</span>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-[#A9BBA7]" />
              <span>Verified corporate recruiters with authorizer-approved roles</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right Column - Registration Form Pane */}
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

          {/* Step 1: Verification OTP Card */}
          {isOtpStep ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div>
                <div className="w-11 h-11 rounded-lg bg-[#123B32] text-white flex items-center justify-center mb-4">
                  <KeyRound className="w-5 h-5 text-[#FF7058]" />
                </div>
                <h2 className="font-serif text-3xl font-normal text-[#123B32]">Verify Email</h2>
                <p className="text-xs sm:text-sm text-[#777D74] mt-1">
                  We dispatched a 6-digit code to <span className="font-semibold text-[#123B32]">{formData.email}</span>.
                </p>
              </div>

              {resendSuccess && (
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                  {resendSuccess}
                </div>
              )}

              {otpError && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs">
                  {otpError}
                </div>
              )}

              {otpPreview && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-mono">
                  <span>Development OTP Preview: <strong>{otpPreview}</strong></span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    6-Digit Verification Code
                  </label>
                  <Input
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    className="bg-white border-[#E6E5DC] text-center font-mono text-lg tracking-widest text-[#123B32] focus-visible:ring-[#123B32] h-12"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    required
                    autoFocus
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] font-semibold h-11 rounded-lg text-xs tracking-wider uppercase shadow-sm"
                  disabled={otpLoading}
                >
                  {otpLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Verify & Enter Workspace</span>
                  )}
                </Button>
              </form>

              <div className="flex items-center justify-between text-xs text-[#777D74] pt-2 border-t border-[#E6E5DC]">
                <button
                  type="button"
                  onClick={() => setIsOtpStep(false)}
                  className="hover:text-[#123B32] transition-colors"
                >
                  &larr; Edit details
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isResending}
                  className="font-semibold text-[#FF7058] hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {isResending && <RotateCw className="w-3 h-3 animate-spin" />}
                  <span>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}</span>
                </button>
              </div>
            </motion.div>
          ) : isSubmittedSuccess ? (
            <div className="p-8 rounded-xl bg-white border border-[#E6E5DC] text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-2xl text-[#123B32]">Registration Initialized</h2>
              <p className="text-xs text-[#777D74]">
                Check your inbox at <strong className="text-[#123B32]">{formData.email}</strong> to activate your credentials.
              </p>
              <Button
                onClick={() => navigate("/login")}
                className="w-full bg-[#123B32] text-[#F7F5EF] text-xs uppercase tracking-wider font-semibold py-3"
              >
                Proceed to Sign In
              </Button>
            </div>
          ) : (
            <>
              <div>
                <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#123B32]">
                  Create Account
                </h1>
                <p className="text-xs sm:text-sm text-[#777D74] mt-1.5 font-sans">
                  Begin your intelligent career advantage in minutes.
                </p>
              </div>

              {error && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    Full Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Jane Doe"
                    className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11"
                    icon={<User className="w-4 h-4 text-[#777D74]" />}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="name@email.com"
                    className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11"
                    icon={<Mail className="w-4 h-4 text-[#777D74]" />}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 8 chars (1 upper, 1 lower, 1 digit, 1 special)"
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
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                    Confirm Password
                  </label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Repeat your password"
                    className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11"
                    icon={<Lock className="w-4 h-4 text-[#777D74]" />}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="terms"
                    checked={formData.agreeTerms}
                    onCheckedChange={(checked) => setFormData({ ...formData, agreeTerms: checked as boolean })}
                    className="border-[#E6E5DC] data-[state=checked]:bg-[#123B32] data-[state=checked]:text-white"
                  />
                  <label htmlFor="terms" className="text-xs text-[#777D74] cursor-pointer select-none">
                    I agree to the Terms of Service & Privacy Policy
                  </label>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] font-semibold h-11 rounded-lg text-xs tracking-wider uppercase shadow-sm"
                  disabled={isLoading || !formData.agreeTerms}
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <span>Create Candidate Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#E6E5DC]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-[#F7F5EF] text-[#777D74] uppercase tracking-wider text-[11px] font-semibold">
                    Or Sign Up With
                  </span>
                </div>
              </div>

              <div>
                <GoogleAuthButton
                  onSuccess={handleGoogleTokenSuccess}
                  onError={handleGoogleError}
                  isLoading={googleLoading}
                  buttonText="Sign up with Google"
                />
              </div>

              <div className="pt-2 text-center text-xs text-[#777D74] border-t border-[#E6E5DC]">
                Already have an account?{" "}
                <Link to="/login" className="text-[#FF7058] hover:underline font-semibold">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Signup;
