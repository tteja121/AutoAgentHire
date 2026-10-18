import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Mail, Lock, User, Eye, EyeOff, ArrowRight, Briefcase, ShieldCheck, KeyRound, RotateCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { authService } from "@/services/authService";
import { useGoogleLogin } from "@react-oauth/google";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

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

  // Explicitly ensure form is clean and unpolluted by browser autofill on load
  useEffect(() => {
    setFormData({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      agreeTerms: false,
    });
    setError(null);
  }, []);

  // Direct Google OAuth registration via Google Identity Services (@react-oauth/google)
  const registerWithGooglePopup = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true);
      setError(null);
      try {
        const accessToken = tokenResponse?.access_token;
        if (!accessToken) throw new Error("No access token received from Google.");
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
    },
    onError: (err) => {
      console.warn("[Google Sign-Up] Dialog closed or cancelled:", err);
      setGoogleLoading(false);
    },
  });

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError(null);

    // Prefer direct Google Identity popup flow using configured Google Client ID
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
    if (googleClientId && !googleClientId.includes("PASTE_YOUR_GOOGLE_CLIENT_ID")) {
      try {
        registerWithGooglePopup();
        return;
      } catch (err) {
        console.warn("[Google Auth] Popup trigger notice, falling back to Google redirect:", err);
      }
    }

    // Direct Google OAuth redirect flow
    try {
      await authService.signInWithGoogle({
        redirectTo: `${window.location.origin}/auth/callback`,
      });
    } catch (err: any) {
      console.error("[Google OAuth] Sign-up error:", err);
      const msg = err?.message || "Google sign-up failed. Please try again.";
      setError(msg);
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side: confirm passwords match
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Client-side: basic password strength check
    const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/;
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
      setOtpError(err?.message || "Invalid verification code. Please check your email and try again.");
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
      setResendSuccess(res?.message || "A new 6-digit code has been dispatched to your email.");
      setResendCooldown(60);
    } catch (err: any) {
      setOtpError(err?.message || "Failed to resend verification code.");
    } finally {
      setIsResending(false);
    }
  };


  const getPasswordStrength = () => {
    const { password } = formData;
    if (!password) return { width: "0%", color: "bg-muted", label: "" };
    if (password.length < 6) return { width: "25%", color: "bg-destructive", label: "Weak" };
    if (password.length < 10) return { width: "50%", color: "bg-warning", label: "Fair" };
    if (password.length < 14) return { width: "75%", color: "bg-primary", label: "Good" };
    return { width: "100%", color: "bg-success", label: "Strong" };
  };

  const strength = getPasswordStrength();

  return (
    <div className="min-h-screen flex">
      {/* Left side - Illustration */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-navy-800 to-background items-center justify-center p-12 overflow-hidden">
        <div className="absolute inset-0 floating-particles opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px]" />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center"
        >
          <div className="w-32 h-32 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center animate-float shadow-xl shadow-primary/30">
            <Bot className="w-16 h-16 text-primary-foreground" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Join AutoAgentHire</h2>
          <p className="text-muted-foreground max-w-sm">
            Let AI automate your job applications while you focus on what matters most.
          </p>
        </motion.div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Logo for mobile */}
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">AutoAgentHire</span>
          </Link>

          {isOtpStep ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 rounded-2xl bg-card border border-border shadow-xl space-y-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-blue-500/20 border border-primary/30 text-primary mx-auto flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider">
                  <KeyRound className="w-3.5 h-3.5" />
                  Client Account Verification
                </div>
                <h2 className="text-2xl font-bold">Verify Your Email</h2>
                <p className="text-muted-foreground text-sm">
                  We sent a 6-digit verification code to
                </p>
                <div className="font-semibold text-foreground text-sm break-all bg-muted/50 px-3 py-1 rounded-lg inline-block border border-border">
                  {formData.email}
                </div>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                {otpError && (
                  <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-destructive mt-2 shrink-0" />
                    <div>{otpError}</div>
                  </div>
                )}

                {resendSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                    <div>{resendSuccess}</div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block text-center">
                    Enter 6-Digit Code
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => {
                      setOtpError(null);
                      setOtpCode(e.target.value.replace(/\D/g, ""));
                    }}
                    placeholder="------"
                    className="text-center font-mono text-2xl tracking-[0.4em] font-extrabold h-14 bg-background border-primary/30 focus-visible:ring-primary"
                    autoFocus
                  />
                  <p className="text-xs text-center text-muted-foreground">
                    Code valid for 15 minutes
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full font-semibold shadow-md gap-2 h-12"
                  disabled={otpLoading || otpCode.length < 6}
                >
                  {otpLoading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Verify & Activate Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="pt-2 text-center text-xs space-y-3">
                <div className="text-muted-foreground">
                  Didn't receive the email?{" "}
                  {resendCooldown > 0 ? (
                    <span className="text-muted-foreground font-medium">
                      Resend in {resendCooldown}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isResending}
                      className="text-primary hover:underline font-semibold inline-flex items-center gap-1"
                    >
                      {isResending && <RotateCw className="w-3 h-3 animate-spin" />}
                      Resend Code
                    </button>
                  )}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOtpStep(false);
                      setOtpError(null);
                      setResendSuccess(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Edit registration details
                  </button>
                </div>
              </div>
            </motion.div>
          ) : isSubmittedSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 rounded-2xl bg-card border border-border shadow-xl text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                <Mail className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Check your email</h2>
                <p className="text-muted-foreground text-sm">
                  We sent a confirmation link to <span className="text-foreground font-semibold">{formData.email}</span>.
                </p>
                <p className="text-muted-foreground text-xs pt-1">
                  Please click the link in that email to confirm your account before logging in.
                </p>
              </div>
              <div className="pt-4 space-y-3">
                <Button
                  onClick={() => navigate("/login")}
                  className="w-full bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 text-white font-semibold py-5"
                >
                  Proceed to Sign In
                </Button>
                <p className="text-xs text-muted-foreground">
                  Didn't receive an email? Check your spam folder or verify your registered email.
                </p>
              </div>
            </motion.div>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-2">Create your account</h1>
              <p className="text-muted-foreground mb-8">
                Start automating your job applications today
              </p>

              <form onSubmit={handleSubmit} autoComplete="off" className="space-y-5">
                {error && (
                  <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-destructive mt-2 shrink-0" />
                      <div className="leading-relaxed">{error}</div>
                    </div>
                    {(error.toLowerCase().includes("already exists") || error.toLowerCase().includes("already registered")) && (
                      <div className="pt-1 text-xs text-foreground/80 font-medium pl-3.5">
                        Already have an account?{" "}
                        <Link to="/login" className="text-primary hover:underline font-semibold ml-1">
                          Sign in here &rarr;
                        </Link>
                      </div>
                    )}
                  </div>
                )}

            <div>
              <label className="block text-sm font-medium mb-2">Full Name</label>
              <Input
                type="text"
                name="signup_fullname"
                autoComplete="off"
                placeholder="John Doe"
                icon={<User className="w-4 h-4" />}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <Input
                type="email"
                name="signup_email"
                autoComplete="new-password"
                placeholder="john@example.com"
                icon={<Mail className="w-4 h-4" />}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  name="signup_password"
                  autoComplete="new-password"
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
              {formData.password && (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${strength.color} transition-all duration-300`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground mt-1">{strength.label}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Confirm Password</label>
              <Input
                type={showPassword ? "text" : "password"}
                name="signup_confirm_password"
                autoComplete="new-password"
                placeholder="Confirm your password"
                icon={<Lock className="w-4 h-4" />}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
              />
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="terms"
                checked={formData.agreeTerms}
                onCheckedChange={(checked) => setFormData({ ...formData, agreeTerms: checked as boolean })}
              />
              <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed">
                I agree to the{" "}
                <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              </label>
            </div>

            <Button
              type="submit"
              variant="hero"
              size="lg"
              className="w-full"
              disabled={isLoading || !formData.agreeTerms}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-background text-muted-foreground">Or sign up with</span>
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={handleGoogleSignUp}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <div className="w-4 h-4 border-2 border-border border-t-foreground rounded-full animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Google
            </Button>
          </div>

          <p className="text-center text-muted-foreground mt-8">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Signup;
