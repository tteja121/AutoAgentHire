import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { authService } from "@/services/authService";
import { Sparkles, AlertTriangle, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasProcessedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const processOAuthCallback = async () => {
      try {
        const searchParams = new URLSearchParams(location.search);
        const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));

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

        const accessToken = hashParams.get("access_token") || searchParams.get("access_token");

        if (accessToken) {
          const result = await authService.signInWithGoogleToken(accessToken);
          const effectiveRole = result.role || "candidate";

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
    <div className="min-h-screen bg-[#F7F5EF] text-[#202722] flex items-center justify-center p-6">
      <div className="w-full max-w-md p-8 sm:p-10 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow text-center space-y-6">
        <div className="w-14 h-14 rounded-xl bg-[#123B32] text-white mx-auto flex items-center justify-center shadow-sm">
          <Sparkles className="w-6 h-6 text-[#FF7058]" />
        </div>

        {status === "loading" && (
          <div className="space-y-3">
            <div className="w-7 h-7 border-2 border-[#123B32] border-t-transparent rounded-full animate-spin mx-auto" />
            <h2 className="font-serif text-2xl font-normal text-[#123B32]">Completing Authorization</h2>
            <p className="text-xs text-[#777D74] leading-relaxed">
              Verifying credentials and synchronizing your workspace...
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-700 mx-auto" />
            <h2 className="font-serif text-2xl font-normal text-emerald-800">Authenticated Successfully</h2>
            <p className="text-xs text-[#777D74]">Redirecting to your workspace...</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 text-left">
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="font-semibold text-xs text-red-900">{errorMessage || "Authentication Error"}</p>
                {errorDetails && <p className="text-xs text-[#777D74] leading-relaxed">{errorDetails}</p>}
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button asChild className="w-full bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] text-xs font-semibold h-11 gap-2">
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
                className="w-full border-[#E6E5DC] text-[#123B32] text-xs font-semibold h-11 gap-2"
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
