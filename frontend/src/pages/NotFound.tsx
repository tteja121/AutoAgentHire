import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, Briefcase } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F5EF] p-6 text-[#202722]">
      <div className="max-w-md w-full text-center space-y-6 p-8 sm:p-10 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow">
        <div className="w-20 h-20 rounded-2xl bg-[#F7F5EF] border border-[#E6E5DC] flex items-center justify-center mx-auto text-[#123B32] font-serif text-3xl font-bold">
          404
        </div>
        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-normal text-[#123B32] tracking-tight">
            Page Not Found
          </h1>
          <p className="text-xs sm:text-sm text-[#777D74] leading-relaxed">
            The requested destination ({location.pathname}) does not exist or has been relocated.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button asChild className="bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] text-xs font-semibold h-11 px-5 rounded-lg gap-2">
            <Link to="/">
              <Home className="w-4 h-4 text-[#FF7058]" />
              <span>Return to Home</span>
            </Link>
          </Button>
          <Button variant="outline" asChild className="border-[#E6E5DC] hover:border-[#123B32] text-xs font-semibold text-[#123B32] h-11 px-5 rounded-lg gap-2">
            <Link to="/candidate/jobs">
              <Briefcase className="w-4 h-4" />
              <span>Curated Roles</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
