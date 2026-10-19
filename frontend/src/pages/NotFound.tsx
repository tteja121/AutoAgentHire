import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="max-w-md w-full text-center space-y-6 p-8 rounded-3xl bg-card/60 border border-white/10 shadow-2xl backdrop-blur-xl">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary text-3xl font-black">
          404
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Page Not Found</h1>
          <p className="text-sm text-muted-foreground">
            The page you requested ({location.pathname}) does not exist or has moved.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="hero" asChild className="gap-2">
            <Link to="/">
              <Home className="w-4 h-4" />
              <span>Return to Home</span>
            </Link>
          </Button>
          <Button variant="outline" asChild className="gap-2 border-white/10">
            <Link to="/candidate/jobs">
              <span>Browse Jobs</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
