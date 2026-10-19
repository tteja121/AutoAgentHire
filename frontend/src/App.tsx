import { useState, useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<string>("candidate");

  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      // 1. Check existing localStorage token
      const storedToken = localStorage.getItem("authToken");
      const storedRole = localStorage.getItem("userRole") || "candidate";

      if (!storedToken) {
        if (isMounted) {
          setIsAuthenticated(false);
          setCheckingAuth(false);
        }
        return;
      }

      // 2. Validate token against backend /auth/me
      try {
        const res = await apiClient.get(API_ENDPOINTS.auth.me);
        if (res.data) {
          const freshRole = res.data.role || storedRole;
          localStorage.setItem("userRole", freshRole);
          if (isMounted) {
            setUserRole(freshRole);
            setIsAuthenticated(true);
            setCheckingAuth(false);
          }
          return;
        }
      } catch (err: any) {
        // If 401 Unauthorized or 403 Forbidden, session is expired or invalid
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          localStorage.removeItem("authToken");
          localStorage.removeItem("userRole");
          if (isMounted) {
            setIsAuthenticated(false);
            setCheckingAuth(false);
          }
          return;
        }

        // Only use stored role fallback on true network offline errors (no response from server)
        if (storedToken && isMounted && !err?.response) {
          setUserRole(storedRole);
          setIsAuthenticated(true);
          setCheckingAuth(false);
          return;
        }
      }

      if (isMounted) {
        setIsAuthenticated(false);
        setCheckingAuth(false);
      }
    };

    verifySession();

    return () => {
      isMounted = false;
    };
  }, []);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground font-medium">Verifying authorization...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    if (userRole === "authorizer") return <Navigate to="/authorizer" replace />;
    if (userRole === "recruiter") return <Navigate to="/recruiter" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
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
              <Route path="/recruiter/register" element={<RecruiterRegister />} />
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
