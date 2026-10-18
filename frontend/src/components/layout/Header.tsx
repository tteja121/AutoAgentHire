import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bot, Menu, X, LayoutDashboard, Briefcase, ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/authService";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Browse Jobs", href: "/candidate/jobs" },
  { name: "Recruiter Registration", href: "/recruiter/register" },
  { name: "Features", href: "/#features" },
  { name: "How It Works", href: "/#how-it-works" },
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
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="bg-background/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center group-hover:shadow-lg group-hover:shadow-primary/30 transition-all">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">AutoAgentHire</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location.pathname === link.href ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {authToken ? (
              <>
                <Button variant="default" asChild className="gap-2">
                  <Link to={portal.href}>
                    <PortalIcon className="w-4 h-4" />
                    <span>{portal.label}</span>
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive gap-1.5">
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/login">Login</Link>
                </Button>
                <Button variant="default" asChild>
                  <Link to="/signup">Sign Up</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background/95 backdrop-blur-xl border-b border-white/5"
          >
            <nav className="flex flex-col p-4 gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-3 rounded-lg text-foreground hover:bg-primary/10 transition-colors"
                >
                  {link.name}
                </Link>
              ))}
              <hr className="border-white/10 my-2" />
              {authToken ? (
                <>
                  <Link
                    to={portal.href}
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 rounded-lg text-primary font-semibold hover:bg-primary/10 transition-colors flex items-center gap-2"
                  >
                    <PortalIcon className="w-4 h-4" />
                    <span>{portal.label}</span>
                  </Link>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      handleLogout();
                    }}
                    className="px-4 py-3 rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-left flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 rounded-lg text-foreground hover:bg-primary/10 transition-colors"
                  >
                    Login
                  </Link>
                  <Button variant="hero" className="mt-2" asChild>
                    <Link to="/signup" onClick={() => setIsOpen(false)}>
                      Sign Up
                    </Link>
                  </Button>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
