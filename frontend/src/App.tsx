import { useState, useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { apiClient, API_ENDPOINTS } from "./lib/api";

// Code-split route components for fast page loads and smooth navigation
const Index = lazy(() => import("./pages/Index"));
const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
const OnboardingIntegrated = lazy(() => import("./pages/OnboardingIntegrated"));
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const Applications = lazy(() => import("./pages/dashboard/Applications"));
const AutomationPage = lazy(() => import("./pages/Automation"));
const ResumeParserPage = lazy(() => import("./pages/dashboard/ResumeParserPage"));
const RecruiterPortal = lazy(() => import("./pages/RecruiterPortal"));
const RecruiterRegister = lazy(() => import("./pages/RecruiterRegister"));
const AuthorizerPortal = lazy(() => import("./pages/AuthorizerPortal"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const CandidateJobsPage = lazy(() => import("./pages/CandidateJobsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ApiKeySettings = lazy(() =>
  import("./components/ApiKeySettings").then((m) => ({ default: m.ApiKeySettings }))
);
const ProfilePage = lazy(() => import("./pages/dashboard/ProfilePage"));
const PracticePage = lazy(() => import("./pages/dashboard/PracticePage"));

const PageLoading = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-muted-foreground font-medium">Loading...</p>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RoleProtectedRoute = ({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: React.ReactNode;
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Optimistic authentication: check stored credentials synchronously so page mounts instantly on refresh
  const getStoredToken = () => {
    if (typeof window === "undefined") return null;
    return (
      localStorage.getItem("authToken") ||
      localStorage.getItem("token") ||
      localStorage.getItem("access_token")
    );
  };

  const getStoredRole = () => {
    if (typeof window === "undefined") return "candidate";
    return localStorage.getItem("userRole") || "candidate";
  };

  const initialToken = getStoredToken();
  const initialRole = getStoredRole();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Boolean(initialToken));
  const [userRole, setUserRole] = useState<string>(initialRole);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(!initialToken);

  useEffect(() => {
    let isMounted = true;

    const verifySessionInBackground = async () => {
      const currentToken = getStoredToken();
      if (!currentToken) {
        if (isMounted) {
          setIsAuthenticated(false);
          setCheckingAuth(false);
        }
        return;
      }

      // Non-blocking background verification against /auth/me
      try {
        const res = await apiClient.get(API_ENDPOINTS.auth.me);
        if (res.data && isMounted) {
          const freshRole = res.data.role || getStoredRole();
          localStorage.setItem("userRole", freshRole);
          setUserRole(freshRole);
          setIsAuthenticated(true);
          setCheckingAuth(false);
        }
      } catch (err: any) {
        // Only invalidate if the server explicitly responded with 401 Unauthorized or 403 Forbidden
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          localStorage.removeItem("authToken");
          localStorage.removeItem("token");
          localStorage.removeItem("access_token");
          localStorage.removeItem("userRole");
          if (isMounted) {
            setIsAuthenticated(false);
            setCheckingAuth(false);
          }
        } else {
          // On network errors or server reboot, maintain optimistic access from localStorage
          if (isMounted && currentToken) {
            setIsAuthenticated(true);
            setCheckingAuth(false);
          }
        }
      }
    };

    verifySessionInBackground();

    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground font-medium">Restoring session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const currentTarget = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${currentTarget}`} replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    if (userRole === "authorizer") return <Navigate to="/authorizer" replace />;
    if (userRole === "recruiter") return <Navigate to="/recruiter" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const SessionExpiredListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleExpired = (e: any) => {
      const message = e.detail?.message || "Your session has expired. Please sign in again.";
      const currentPath = window.location.pathname;
      if (currentPath === "/login" || currentPath === "/signup" || currentPath.startsWith("/auth/")) {
        return;
      }
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/login?message=${encodeURIComponent(message)}&returnTo=${returnTo}`, { replace: true });
    };

    window.addEventListener("auth:session_expired", handleExpired);
    return () => {
      window.removeEventListener("auth:session_expired", handleExpired);
    };
  }, [navigate]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <SessionExpiredListener />
        <ErrorBoundary>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth-callback" element={<AuthCallback />} />
              <Route path="/callback" element={<AuthCallback />} />
              <Route
                path="/onboarding"
                element={
                  <RoleProtectedRoute allowedRoles={["candidate", "admin"]}>
                    <OnboardingIntegrated />
                  </RoleProtectedRoute>
                }
              />
              {/* Client Portal routes with Sidebar */}
              <Route
                element={
                  <RoleProtectedRoute allowedRoles={["candidate", "admin"]}>
                    <DashboardLayout />
                  </RoleProtectedRoute>
                }
              >
                <Route path="/ats-checker" element={<Navigate to="/candidate/jobs" replace />} />
                <Route path="/candidate/jobs" element={<CandidateJobsPage />} />
                <Route path="/candidate/practice" element={<PracticePage />} />
                <Route path="/jobs" element={<Navigate to="/candidate/jobs" replace />} />
                <Route path="/browse-jobs" element={<Navigate to="/candidate/jobs" replace />} />
              </Route>
              <Route path="/recruiter/dashboard" element={<Navigate to="/recruiter" replace />} />
              <Route path="/authorizer/dashboard" element={<Navigate to="/authorizer" replace />} />
              <Route
                path="/recruiter"
                element={
                  <RoleProtectedRoute allowedRoles={["recruiter"]}>
                    <RecruiterPortal />
                  </RoleProtectedRoute>
                }
              />
              <Route path="/privacy" element={<Navigate to="/#features" replace />} />
              <Route path="/terms" element={<Navigate to="/#features" replace />} />
              <Route path="/recruiter/register" element={<RecruiterRegister />} />
              <Route path="/recruiter-register" element={<Navigate to="/recruiter/register" replace />} />
              <Route
                path="/authorizer"
                element={
                  <RoleProtectedRoute allowedRoles={["authorizer"]}>
                    <AuthorizerPortal />
                  </RoleProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <RoleProtectedRoute allowedRoles={["candidate", "admin"]}>
                    <DashboardLayout />
                  </RoleProtectedRoute>
                }
              >
                <Route index element={<DashboardHome />} />
                <Route path="jobs" element={<CandidateJobsPage />} />
                <Route path="search" element={<Navigate to="/candidate/jobs" replace />} />
                <Route path="applications" element={<Applications />} />
                <Route path="automation" element={<AutomationPage />} />
                <Route path="resume" element={<ResumeParserPage />} />
                <Route path="practice" element={<PracticePage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<ApiKeySettings />} />
                <Route path="help" element={<Navigate to="/dashboard" replace />} />
                <Route path="ats" element={<Navigate to="/candidate/jobs" replace />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
