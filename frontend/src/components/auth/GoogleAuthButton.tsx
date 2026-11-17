import React, { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { AlertTriangle } from "lucide-react";
import { isGoogleOAuthConfigured } from "@/lib/googleAuth";

interface GoogleAuthButtonProps {
  onSuccess: (token: string) => Promise<void>;
  onError?: (errorMsg: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  buttonText?: string;
  className?: string;
}

export const GoogleIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4 shrink-0" }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
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

// Inner active component that calls useGoogleLogin ONLY when GoogleOAuthProvider is loaded
const GoogleActiveTrigger: React.FC<GoogleAuthButtonProps> = ({
  onSuccess,
  onError,
  isLoading,
  disabled,
  buttonText = "Continue with Google",
  className = "",
}) => {
  const [internalLoading, setInternalLoading] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setInternalLoading(true);
      try {
        const token = tokenResponse?.access_token;
        if (!token) {
          throw new Error("No access token received from Google Identity Services.");
        }
        await onSuccess(token);
      } catch (err: any) {
        onError?.(err?.message || "Google authentication failed.");
      } finally {
        setInternalLoading(false);
      }
    },
    onError: (err) => {
      onError?.(err?.error_description || "Google authorization was cancelled or closed.");
      setInternalLoading(false);
    },
  });

  const loading = isLoading || internalLoading;

  return (
    <button
      type="button"
      onClick={() => login()}
      disabled={disabled || loading}
      className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-[#E6E5DC] bg-white hover:bg-stone-50/80 text-[#202722] text-xs font-medium transition-all shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-stone-300 border-t-[#123B32] rounded-full animate-spin" />
      ) : (
        <GoogleIcon />
      )}
      <span>{buttonText}</span>
    </button>
  );
};

export const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = (props) => {
  const isConfigured = isGoogleOAuthConfigured();
  const [showConfigNotice, setShowConfigNotice] = useState(false);

  if (!isConfigured) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowConfigNotice(prev => !prev)}
          className={`w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-[#E6E5DC] bg-[#FAF8F3] text-[#777D74] text-xs font-medium cursor-pointer transition-all hover:border-[#123B32]/30 ${props.className || ""}`}
          title="Google Sign-In is not configured"
        >
          <GoogleIcon className="w-4 h-4 shrink-0 opacity-50 grayscale" />
          <span>{props.buttonText || "Continue with Google"}</span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-200/60 text-stone-600 font-semibold ml-1">
            Setup Required
          </span>
        </button>

        {showConfigNotice && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2 animate-in fade-in duration-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="block font-semibold text-amber-950">Google OAuth Not Configured</strong>
              <span>
                To enable Google login, add your Google OAuth Client ID to <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[11px] font-mono">VITE_GOOGLE_CLIENT_ID</code> in <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[11px] font-mono">.env.local</code>. Email and password authentication is fully active.
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <GoogleActiveTrigger {...props} />;
};

