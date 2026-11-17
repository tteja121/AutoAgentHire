import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Sparkles, Menu, X, LayoutDashboard, Briefcase, ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/authService";

const navLinks = [
  { name: "Overview", href: "/" },
  { name: "Explore Roles", href: "/candidate/jobs" },
  { name: "Features", href: "/#features" },
  { name: "How It Works", href: "/#how-it-works" },
  { name: "For Recruiters", href: "/recruiter/register" },
];

export const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("candidate");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const role = localStorage.getItem("userRole") || "candidate";
    setAuthToken(token);
    setUserRole(role);
  }, [location.pathname]);

  const handleLogout = async () => {
    await authService.signOut();
    setAuthToken(null);
    navigate("/");
  };

  const getPortalInfo = () => {
    if (userRole === "authorizer") {
      return {
        label: "Authorizer Portal",
        href: "/authorizer",
        icon: ShieldCheck,
      };
    }
    if (userRole === "recruiter") {
      return {
        label: "Recruiter Portal",
        href: "/recruiter",
        icon: Briefcase,
      };
    }
    return {
      label: "Candidate Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    };
  };

  const portal = getPortalInfo();
  const PortalIcon = portal.icon;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-200">
      <div className="bg-[#F7F5EF]/95 backdrop-blur-md border-b border-[#E6E5DC]">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo with Neo Editorial Branding */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-[#123B32] text-[#F7F5EF] flex items-center justify-center transition-transform group-hover:scale-105 shadow-sm">
              <Sparkles className="w-5 h-5 text-[#FF7058]" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-2xl tracking-tight text-[#123B32] leading-none font-bold">
                AutoAgentHire
              </span>
              <span className="text-[10px] tracking-widest uppercase font-medium text-[#777D74] mt-0.5">
                Editorial AI Intelligence
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.href;
              return (
                <Link
                  key={link.name}
                  to={link.href}
                  className={`text-xs uppercase tracking-wider font-semibold transition-colors duration-200 ${
                    isActive
                      ? "text-[#123B32] border-b-2 border-[#FF7058] pb-1"
                      : "text-[#777D74] hover:text-[#123B32]"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3">
            {authToken ? (
              <>
                <Button
                  variant="default"
                  asChild
                  className="bg-[#123B32] hover:bg-[#1C5246] text-[#F7F5EF] text-xs font-semibold px-4 py-2 gap-2 shadow-sm"
                >
                  <Link to={portal.href}>
                    <PortalIcon className="w-4 h-4 text-[#FF7058]" />
                    <span>{portal.label}</span>
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-xs text-[#777D74] hover:text-[#202722] hover:bg-stone-200/50 gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  asChild
                  className="text-xs font-semibold text-[#123B32] hover:bg-stone-200/60"
                >
                  <Link to="/login">Sign In</Link>
                </Button>
                <Button
                  asChild
                  className="bg-[#FF7058] hover:bg-[#FA5D42] text-white text-xs font-semibold px-5 py-2.5 shadow-sm shadow-[#FF7058]/25"
                >
                  <Link to="/signup">Begin Advantage</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu trigger */}
          <button
            className="lg:hidden p-2 text-[#123B32] hover:bg-stone-200/50 rounded-lg transition-colors"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle Navigation Menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-[#F7F5EF] border-b border-[#E6E5DC] shadow-lg"
          >
            <nav className="flex flex-col p-6 gap-3">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-2 text-sm font-semibold text-[#202722] hover:text-[#123B32] hover:bg-stone-200/40 rounded-lg transition-colors"
                >
                  {link.name}
                </Link>
              ))}
              <div className="border-t border-[#E6E5DC] my-2 pt-3" />
              {authToken ? (
                <>
                  <Link
                    to={portal.href}
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 rounded-lg bg-[#123B32] text-[#F7F5EF] font-semibold text-sm flex items-center gap-2"
                  >
                    <PortalIcon className="w-4 h-4 text-[#FF7058]" />
                    <span>{portal.label}</span>
                  </Link>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      handleLogout();
                    }}
                    className="px-4 py-2.5 rounded-lg text-sm text-[#777D74] hover:text-red-600 transition-colors text-left flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  <Link
                    to="/login"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2.5 rounded-lg text-center text-sm font-semibold border border-[#E6E5DC] bg-white text-[#123B32]"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2.5 rounded-lg text-center text-sm font-semibold bg-[#FF7058] text-white"
                  >
                    Begin Advantage
                  </Link>
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
