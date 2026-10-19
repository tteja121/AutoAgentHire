import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Bot, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft,
  Clock, AlertTriangle, User, KeyRound,
  CheckCircle2, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { authService, isPersonalEmail } from "@/services/authService";
import { useGoogleLogin } from "@react-oauth/google";

type RoleType = "client" | "recruiter" | "authorizer";
type LoginMethod = "email" | "user_id";

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

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Route query param notices
  const isPendingApprovalNotice = location.search.includes("pending_approval");
  const isRegisteredNotice = location.search.includes("registered=1");
  const sessionExpiredMessage = new URLSearchParams(location.search).get("message");

  // Form input states
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Status & error states
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct Google OAuth login strictly routing to the Client Portal only
  const loginWithGooglePopup = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true);
      setError(null);
      try {
        const accessToken = tokenResponse?.access_token;
        if (!accessToken) throw new Error("No access token received from Google.");
        await authService.signInWithGoogleToken(accessToken);
        // Strictly allow and redirect to Client portal only
        localStorage.setItem("userRole", "candidate");
        navigate("/dashboard");
      } catch (err: any) {
        console.error("[Google Auth Error]:", err);
        setError(err?.message || "Google authentication failed. Please try again.");
      } finally {
        setGoogleLoading(false);
      }
    },
    onError: (err) => {
      console.warn("[Google Auth] Dialog closed or cancelled:", err);
      setGoogleLoading(false);
    },
  });

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    // Prefer direct Google Identity popup flow using configured Google Client ID
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
    if (googleClientId && !googleClientId.includes("PASTE_YOUR_GOOGLE_CLIENT_ID")) {
      try {
        loginWithGooglePopup();
        return;
      } catch (err) {
        console.warn("[Google Auth] Popup trigger notice, falling back to Google redirect:", err);
      }
    }

    // Direct Google OAuth redirect flow — strictly lands on Client Portal
    try {
      await authService.signInWithGoogle({
        redirectTo: `${window.location.origin}/dashboard`,
      });
    } catch (err: any) {
      console.error("[Google OAuth] Sign-in error:", err);
      const msg = err?.message || "Google sign-in failed. Please try again.";
      setError(msg);
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = identifier.trim();
    if (!cleanId) {
      setError("Please enter your Email address or User ID.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await authService.signIn(cleanId, password);
      const effectiveRole = result?.role || result?.user?.user_metadata?.role || localStorage.getItem("userRole") || "candidate";

      // Smart role redirection to appropriate portal
      if (effectiveRole === "authorizer") {
        navigate("/authorizer");
      } else if (effectiveRole === "recruiter") {
        navigate("/recruiter");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.toLowerCase().includes("no account found") || msg.toLowerCase().includes("create an account")) {
        setError("No account found with this email. Please sign up to create an account first.");
      } else if (msg.toLowerCase().includes("invalid login credentials") || msg.toLowerCase().includes("invalid credentials")) {
        setError("Invalid Email/User ID or password. Please verify your credentials.");
      } else if (msg.toLowerCase().includes("pending")) {
        setError("Your Recruiter registration request is pending review by the Authorizer. Please wait for authorizer permission before logging in.");
      } else if (msg.toLowerCase().includes("email not confirmed") || msg.toLowerCase().includes("not verified")) {
        setError("Your email address is not verified yet. Please verify your email inbox.");
      } else {
        setError(msg || "Login failed. Please verify your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Dynamic Visual Experience */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-navy-800 to-background items-center justify-center p-12 overflow-hidden border-r border-border/50">
        <div className="absolute inset-0 floating-particles opacity-30" />
        <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/3 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 text-center max-w-md"
        >
          <div className="w-28 h-28 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-xl shadow-primary/30">
            <Bot className="w-14 h-14 text-primary-foreground" />
          </div>

          <h2 className="text-3xl font-bold mb-3 tracking-tight">
            AutoAgentHire Platform
          </h2>

          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            Single unified login for Candidates, Recruiters, and Authorizers. Manage automated applications, job postings, and organizational governance in one integrated suite.
          </p>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Unified Access (Email / User ID Supported)</span>
          </div>
        </motion.div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-10">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-6"
        >
          {/* Mobile Logo */}
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">AutoAgentHire</span>
          </Link>

          {/* Back to Home / Landing Page */}
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs md:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Back to Home</span>
            </Link>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Welcome Back</h1>
            <p className="text-muted-foreground text-xs md:text-sm mt-1">
              Enter your credentials to access your account
            </p>
          </div>

          {/* Pending Approval / Registration / Session Expired Notices */}
          {sessionExpiredMessage && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold text-amber-200">Session Expired</strong>
                <span>{sessionExpiredMessage}</span>
              </div>
            </div>
          )}

          {isPendingApprovalNotice && !sessionExpiredMessage && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold text-amber-200">Registration Under Review</strong>
                <span>Your recruiter registration is in the Authorizer verification queue. Once authorized, sign in with your credentials.</span>
              </div>
            </div>
          )}

          {isRegisteredNotice && !isPendingApprovalNotice && !sessionExpiredMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold text-emerald-300">Account Created</strong>
                <span>Please sign in using your registered credentials.</span>
              </div>
            </div>
          )}

          {/* Error Notice */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${error.toLowerCase().includes("pending") || error.toLowerCase().includes("authorizer")
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-300"
                : "bg-destructive/10 border border-destructive/20 text-destructive"
                }`}
            >
              {error.toLowerCase().includes("pending") ? (
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">
                <div>{error}</div>
                {error.toLowerCase().includes("not verified") && identifier && (
                  <Link
                    to={`/signup?email=${encodeURIComponent(identifier)}&verify=1`}
                    className="inline-block mt-1.5 font-semibold text-primary hover:underline"
                  >
                    Enter 6-digit OTP to verify account &rarr;
                  </Link>
                )}
              </div>
            </motion.div>
          )}

          {/* Single Unified Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Field 1: Email / User ID */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-foreground flex items-center justify-between">
                <span>Email / User ID</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  Email/User ID
                </span>
              </label>

              <Input
                type="text"
                placeholder="Enter your email/User ID"
                icon={<Mail className="w-4 h-4 text-primary" />}
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (error) setError(null);
                }}
                required
                autoComplete="username"
              />
            </div>

            {/* Field 2: Password */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-foreground">Password</label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  icon={<Lock className="w-4 h-4 text-primary" />}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="remember"
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked as boolean)}
              />
              <label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer select-none">
                Remember this device for 30 days
              </label>
            </div>

            {/* Single Submit Button */}
            <Button
              type="submit"
              variant="hero"
              size="lg"
              className="w-full font-semibold shadow-md gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Social login strictly for Client Portal */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-background text-muted-foreground">Or continue with personal account</span>
            </div>
          </div>

          <div>
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2 text-xs font-medium"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <div className="w-4 h-4 border-2 border-border border-t-foreground rounded-full animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </Button>
          </div>

          {/* Bottom Navigation Links */}
          <div className="pt-2 text-center text-xs text-muted-foreground space-y-2">
            <p>
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary hover:underline font-semibold">
                Create a free Client account
              </Link>
            </p>
            <p>
              Recruiter?{" "}
              <Link to="/recruiter/register" className="text-primary hover:underline font-semibold">
                Request Recruiter Registration
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
