import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft,
  Clock, AlertTriangle, CheckCircle2, Sparkles, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { authService } from "@/services/authService";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

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

  const navigatePostLogin = (role: string) => {
    const params = new URLSearchParams(location.search);
    const returnTo = params.get("returnTo");
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("/login") && !returnTo.startsWith("/signup")) {
      navigate(returnTo, { replace: true });
      return;
    }
    if (role === "authorizer") {
      navigate("/authorizer", { replace: true });
    } else if (role === "recruiter") {
      navigate("/recruiter", { replace: true });
    } else {
      navigate("/dashboard", { replace: true });
    }
  };

  // Handle successful Google token response from GoogleAuthButton
  const handleGoogleTokenSuccess = async (accessToken: string) => {
    setGoogleLoading(true);
    setError(null);
    try {
      const result = await authService.signInWithGoogleToken(accessToken);
      const role = result?.role || localStorage.getItem("userRole") || "candidate";
      navigatePostLogin(role);
    } catch (err: any) {
      console.error("[Google Auth Error]:", err);
      setError(err?.message || "Google authentication failed. Please try again.");
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
      const effectiveRole =
        result?.role ||
        result?.user?.user_metadata?.role ||
        localStorage.getItem("userRole") ||
        "candidate";

      navigatePostLogin(effectiveRole);
    } catch (err: any) {
      const msg = err?.message || "";
      if (
        msg.toLowerCase().includes("no account found") ||
        msg.toLowerCase().includes("create an account")
      ) {
        setError("No account found with this email. Please sign up to create an account first.");
      } else if (
        msg.toLowerCase().includes("invalid login credentials") ||
        msg.toLowerCase().includes("invalid credentials")
      ) {
        setError("Invalid Email/User ID or password. Please verify your credentials.");
      } else if (msg.toLowerCase().includes("pending")) {
        setError(
          "Your Recruiter registration request is pending review by the Authorizer. Please wait for authorizer permission before logging in."
        );
      } else if (
        msg.toLowerCase().includes("email not confirmed") ||
        msg.toLowerCase().includes("not verified")
      ) {
        setError("Your email address is not verified yet. Please verify your email inbox.");
      } else {
        setError(msg || "Login failed. Please verify your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F7F5EF] text-[#202722]">
      {/* Left side - Editorial Editorial Experience */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#123B32] text-[#F7F5EF] items-center justify-center p-12 overflow-hidden border-r border-[#123B32]/30">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        
        {/* Subtle Warm Amber Glow */}
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-[#FF7058]/10 rounded-full blur-[100px]" />
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
            Ecosystem Authentication
          </span>

          <h2 className="font-serif text-4xl lg:text-5xl font-normal tracking-tight text-white mb-6 leading-tight">
            The Intelligent Career Operating System.
          </h2>

          <p className="text-[#A9BBA7] text-sm sm:text-base leading-relaxed mb-8 font-sans">
            Unified authentication across Candidate, Recruiter, and Authorizer environments. Monitor applications, configure autonomous agents, and manage enterprise recruitment pipelines.
          </p>

          <div className="p-5 rounded-xl bg-white/[0.04] border border-white/10 space-y-3">
            <div className="flex items-center gap-3 text-xs text-[#E6E5DC]">
              <Shield className="w-4 h-4 text-[#FF7058]" />
              <span>Multi-tier role-based encryption & credential protection</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#E6E5DC]">
              <Sparkles className="w-4 h-4 text-[#A9BBA7]" />
              <span>Supported methods: Corporate/Personal Email & Official User ID</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right side - Editorial Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-6"
        >
          {/* Back to Home Link */}
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#777D74] hover:text-[#123B32] transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Return to Platform</span>
            </Link>
          </div>

          {/* Heading */}
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#123B32]">
              Welcome Back
            </h1>
            <p className="text-xs sm:text-sm text-[#777D74] mt-1.5 font-sans">
              Enter your credentials to enter your workspace.
            </p>
          </div>

          {/* Route Notices */}
          {sessionExpiredMessage && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Session Expired</strong>
                <span>{sessionExpiredMessage}</span>
              </div>
            </div>
          )}

          {isPendingApprovalNotice && !sessionExpiredMessage && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Registration Under Review</strong>
                <span>Your recruiter registration is in the Authorizer verification queue. Once authorized, sign in with your credentials.</span>
              </div>
            </div>
          )}

          {isRegisteredNotice && !isPendingApprovalNotice && !sessionExpiredMessage && (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Account Initialized</strong>
                <span>Please sign in using your registered credentials.</span>
              </div>
            </div>
          )}

          {/* Error Notice */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3.5 rounded-lg text-xs flex items-start gap-2.5 ${
                error.toLowerCase().includes("pending") || error.toLowerCase().includes("authorizer")
                  ? "bg-amber-50 border border-amber-200 text-amber-900"
                  : "bg-red-50 border border-red-200 text-red-900"
              }`}
            >
              {error.toLowerCase().includes("pending") ? (
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">
                <div>{error}</div>
                {error.toLowerCase().includes("not verified") && identifier && (
                  <Link
                    to={`/signup?email=${encodeURIComponent(identifier)}&verify=1`}
                    className="inline-block mt-1.5 font-semibold text-[#123B32] hover:underline"
                  >
                    Enter 6-digit OTP code to verify account &rarr;
                  </Link>
                )}
              </div>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-1.5">
                Email / Official User ID
              </label>
              <Input
                type="text"
                placeholder="name@company.com or User ID"
                className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11"
                icon={<Mail className="w-4 h-4 text-[#777D74]" />}
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (error) setError(null);
                }}
                required
                autoComplete="username"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#123B32]">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-[#777D74] hover:text-[#123B32] transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  className="bg-white border-[#E6E5DC] text-[#202722] focus-visible:ring-[#123B32] text-xs h-11 pr-10"
                  icon={<Lock className="w-4 h-4 text-[#777D74]" />}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777D74] hover:text-[#123B32] p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="remember"
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked as boolean)}
                className="border-[#E6E5DC] data-[state=checked]:bg-[#123B32] data-[state=checked]:text-white"
              />
              <label htmlFor="remember" className="text-xs text-[#777D74] cursor-pointer select-none">
                Remember credentials on this workstation
              </label>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] font-semibold h-11 rounded-lg text-xs tracking-wider uppercase shadow-sm"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>Sign In to Account</span>
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          {/* Social login divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E6E5DC]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-[#F7F5EF] text-[#777D74] uppercase tracking-wider text-[11px] font-semibold">
                Or Continue With
              </span>
            </div>
          </div>

          {/* Safe & Resilient Google Sign-In Component */}
          <div>
            <GoogleAuthButton
              onSuccess={handleGoogleTokenSuccess}
              onError={handleGoogleError}
              isLoading={googleLoading}
              buttonText="Continue with Google"
            />
          </div>

          {/* Navigation Links */}
          <div className="pt-2 text-center text-xs text-[#777D74] space-y-2 font-sans border-t border-[#E6E5DC]">
            <p>
              New candidate?{" "}
              <Link to="/signup" className="text-[#FF7058] hover:underline font-semibold">
                Register for Free Candidate Access
              </Link>
            </p>
            <p>
              Hiring team or talent partner?{" "}
              <Link to="/recruiter/register" className="text-[#123B32] hover:underline font-semibold">
                Request Recruiter Verification
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
