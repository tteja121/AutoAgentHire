import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { authService } from "@/services/authService";
import { Bot, AlertTriangle, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasProcessedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    // Prevent duplicate processing in React StrictMode
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const processOAuthCallback = async () => {
      try {
        const searchParams = new URLSearchParams(location.search);
        const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));

        // 1. Check for OAuth errors
        const oauthError = searchParams.get("error") || hashParams.get("error");
        const oauthErrorDesc =
          searchParams.get("error_description") ||
          hashParams.get("error_description") ||
          searchParams.get("error_code");

        if (oauthError) {
          if (
            oauthError === "access_denied" ||
            oauthErrorDesc?.toLowerCase().includes("cancelled") ||
            oauthErrorDesc?.toLowerCase().includes("denied")
          ) {
            setErrorMessage("Google Sign-In was cancelled.");
            setErrorDetails("You declined or closed Google account consent. You can try again or use your email and password.");
          } else {
            setErrorMessage("Google authentication failed.");
            setErrorDetails(oauthErrorDesc || `OAuth provider returned error: ${oauthError}`);
          }
          setStatus("error");
          return;
        }

        // 2. Extract access_token from hash or search
        const accessToken = hashParams.get("access_token") || searchParams.get("access_token");

        if (accessToken) {
          // Authenticate directly with backend
          const result = await authService.signInWithGoogleToken(accessToken);
          const effectiveRole = result.role || "candidate";

          // Clean the URL query/hash
          window.history.replaceState({}, document.title, window.location.pathname);
          setStatus("success");

          setTimeout(() => {
            if (effectiveRole === "authorizer") {
              navigate("/authorizer", { replace: true });
            } else if (effectiveRole === "recruiter") {
              navigate("/recruiter", { replace: true });
            } else {
              navigate("/dashboard", { replace: true });
            }
          }, 600);
          return;
        }

        // 3. Fallback: Check if user is already authenticated
        const currentUser = await authService.getCurrentUser();
        if (currentUser) {
          const role = currentUser.role || "candidate";
          setStatus("success");
          setTimeout(() => {
            if (role === "authorizer") navigate("/authorizer", { replace: true });
            else if (role === "recruiter") navigate("/recruiter", { replace: true });
            else navigate("/dashboard", { replace: true });
          }, 600);
          return;
        }

        // If no token was found
        setStatus("error");
        setErrorMessage("No authentication credentials detected.");
        setErrorDetails("Please return to the sign in page and try again.");
      } catch (err: any) {
        console.error("[OAuth Callback] Unexpected error:", err);
        setStatus("error");
        setErrorMessage("Authentication Error");
        setErrorDetails(err?.message || "An unexpected error occurred while finishing authentication.");
      }
    };

    processOAuthCallback();
  }, [location, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md p-8 rounded-3xl bg-card border border-white/10 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-blue-500 mx-auto flex items-center justify-center shadow-lg shadow-primary/25">
          <Bot className="w-8 h-8 text-white" />
        </div>

        {status === "loading" && (
          <div className="space-y-4">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <h2 className="text-xl font-bold tracking-tight">Completing Sign-In</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Verifying your credentials and preparing your workspace...
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto animate-bounce" />
            <h2 className="text-xl font-bold tracking-tight text-emerald-400">Authenticated Successfully</h2>
            <p className="text-xs text-muted-foreground">Redirecting you to your dashboard...</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 text-left">
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="font-semibold text-sm text-destructive">{errorMessage || "Authentication Error"}</p>
                {errorDetails && <p className="text-xs text-muted-foreground leading-relaxed">{errorDetails}</p>}
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button asChild className="w-full gap-2">
                <Link to="/login">
                  <span>Return to Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  hasProcessedRef.current = false;
                  window.location.reload();
                }}
                className="w-full gap-2 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Authorization</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
