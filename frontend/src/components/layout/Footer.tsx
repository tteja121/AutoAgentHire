import { Link } from "react-router-dom";
import { Sparkles, ArrowUpRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Footer = () => {
  return (
    <footer className="border-t border-[#E6E5DC] bg-[#123B32] text-[#F7F5EF] relative overflow-hidden">
      {/* Editorial Decorative Watermark */}
      <div className="absolute right-[-2%] bottom-[-5%] text-[140px] font-serif text-white/[0.03] select-none pointer-events-none leading-none">
        Advantage
      </div>

      <div className="max-w-7xl mx-auto px-6 py-20 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-16">
          {/* Brand Col */}
          <div className="md:col-span-4">
            <Link to="/" className="flex items-center gap-3 mb-6 group">
              <div className="w-10 h-10 rounded-lg bg-[#FF7058] text-white flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="font-serif text-2xl tracking-tight text-[#F7F5EF] font-bold">
                AutoAgentHire
              </span>
            </Link>
            <p className="text-[#A9BBA7] text-sm leading-relaxed max-w-sm mb-6">
              Precision recruitment architecture pairing human agency with autonomous AI intelligence. Tailored applications, verified credentials, and high-signal matching.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#A9BBA7]">
              <span className="w-2 h-2 rounded-full bg-[#FF7058] animate-pulse" />
              <span>Neo Editorial AI Engine v2.4 Active</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="md:col-span-2 md:col-start-6">
            <h4 className="text-xs uppercase tracking-widest text-[#FF7058] font-semibold mb-5">
              Platform
            </h4>
            <ul className="space-y-3 text-sm">
              {[
                { name: "Executive Overview", href: "/" },
                { name: "Curated Job Board", href: "/candidate/jobs" },
                { name: "ATS Calibration", href: "/dashboard/resume" },
                { name: "Automation Protocol", href: "/dashboard/automation" },
              ].map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className="text-[#E6E5DC]/80 hover:text-white transition-colors duration-150 inline-flex items-center gap-1 group"
                  >
                    <span>{item.name}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <h4 className="text-xs uppercase tracking-widest text-[#FF7058] font-semibold mb-5">
              Ecosystem
            </h4>
            <ul className="space-y-3 text-sm">
              {[
                { name: "Candidate Portal", href: "/dashboard" },
                { name: "Recruiter Registration", href: "/recruiter/register" },
                { name: "Recruiter Workspace", href: "/recruiter" },
                { name: "Authorizer Governance", href: "/authorizer" },
              ].map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className="text-[#E6E5DC]/80 hover:text-white transition-colors duration-150 inline-flex items-center gap-1 group"
                  >
                    <span>{item.name}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Editorial Newsletter */}
          <div className="md:col-span-4">
            <h4 className="text-xs uppercase tracking-widest text-[#FF7058] font-semibold mb-5">
              The Intelligent Dispatch
            </h4>
            <p className="text-[#A9BBA7] text-sm mb-4 leading-relaxed">
              Curated market reports, ATS algorithm updates, and algorithmic career strategies delivered weekly.
            </p>
            <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter work email"
                className="bg-white/10 border-white/20 text-[#F7F5EF] placeholder:text-stone-300 text-xs focus-visible:ring-[#FF7058]"
                icon={<Mail className="w-4 h-4 text-[#A9BBA7]" />}
              />
              <Button
                type="submit"
                className="bg-[#FF7058] hover:bg-[#FA5D42] text-white text-xs font-semibold px-4 shrink-0"
              >
                Join Dispatch
              </Button>
            </form>
          </div>
        </div>

        {/* Bottom Editorial Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-[#A9BBA7]">
          <div>
            © {new Date().getFullYear()} AutoAgentHire. Engineered for decisive career advantage.
          </div>
          <div className="flex items-center gap-6">
            <span className="hover:text-white transition-colors cursor-pointer">
              Enterprise Privacy
            </span>
            <span className="hover:text-white transition-colors cursor-pointer">
              Algorithmic Governance
            </span>
            <span className="hover:text-white transition-colors cursor-pointer">
              Security Protocol
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
