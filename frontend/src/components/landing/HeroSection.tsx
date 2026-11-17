import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Briefcase, CheckCircle2, ShieldCheck, Zap, FileText, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const HeroSection = () => {
  return (
    <section className="relative min-h-[92vh] flex flex-col justify-center pt-28 pb-20 bg-[#F7F5EF] overflow-hidden">
      {/* Editorial Decorative Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E6E5DC_1px,transparent_1px),linear-gradient(to_bottom,#E6E5DC_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] opacity-40 pointer-events-none" />

      {/* Subtle Warm Editorial Radial Blooms */}
      <div className="absolute top-1/4 right-[10%] w-[480px] h-[480px] bg-[#A9BBA7]/20 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-[5%] w-[420px] h-[420px] bg-[#FF7058]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 w-full">
        {/* Asymmetric Editorial Hero Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center mb-16">
          
          {/* Left Column: Editorial Headline & Copy */}
          <div className="lg:col-span-7 text-left">
            {/* Editorial Category Pill */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white border border-[#E6E5DC] text-[#123B32] text-xs font-semibold uppercase tracking-wider mb-6 shadow-xs"
            >
              <span className="w-2 h-2 rounded-full bg-[#FF7058]" />
              <span>Neo Editorial AI • Career Intelligence Architecture</span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-serif text-4xl sm:text-6xl lg:text-7xl text-[#123B32] font-normal leading-[1.08] tracking-tight mb-6"
            >
              Your Career Deserves an{" "}
              <span className="italic font-normal text-[#FF7058]">
                Intelligent Advantage.
              </span>
            </motion.h1>

            {/* Supporting Text */}
            <motion.p
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg lg:text-xl text-[#777D74] max-w-2xl mb-8 leading-relaxed font-sans"
            >
              Discover better opportunities, build stronger resumes and let intelligent AI agents simplify your job search.
            </motion.p>

            {/* Action CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center mb-8"
            >
              <Button
                asChild
                className="bg-[#FF7058] hover:bg-[#FA5D42] text-white text-sm font-semibold h-13 px-8 rounded-lg shadow-md shadow-[#FF7058]/25 group"
              >
                <Link to="/signup" className="flex items-center justify-center gap-2">
                  <span>Start Free With AI</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>

              <Button
                variant="outline"
                asChild
                className="border-[#E6E5DC] hover:border-[#123B32] bg-white text-[#123B32] text-sm font-semibold h-13 px-7 rounded-lg shadow-xs"
              >
                <Link to="/candidate/jobs" className="flex items-center justify-center gap-2">
                  <Briefcase className="w-4 h-4 text-[#123B32]" />
                  <span>Curated Roles</span>
                </Link>
              </Button>
            </motion.div>

            {/* Editorial Quote Trust Micro-badge */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex items-center gap-4 text-xs text-[#777D74] pt-2 border-t border-[#E6E5DC]"
            >
              <div className="flex -space-x-2">
                {["#123B32", "#A9BBA7", "#FF7058", "#388E7B"].map((c, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold"
                    style={{ backgroundColor: c }}
                  >
                    {String.fromCharCode(65 + i)}
                  </div>
                ))}
              </div>
              <div>
                <strong className="text-[#202722] font-semibold">10,000+ Tailored Applications Submitted</strong>
                <span className="block text-[11px] text-[#777D74]">Calibrated for Workday, Greenhouse & Lever ATS standards</span>
              </div>
            </motion.div>
          </div>

          {/* Right Column: Editorial Architecture Canvas Preview */}
          <div className="lg:col-span-5 relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="relative rounded-2xl bg-white border border-[#E6E5DC] p-6 shadow-xl editorial-shadow"
            >
              {/* Header of the Intelligence Card */}
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#E6E5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#123B32] text-white flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-[#FF7058]" />
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-[#123B32] font-bold leading-tight">
                      Intelligence Monitor
                    </h3>
                    <span className="text-[10px] uppercase font-semibold text-[#777D74] tracking-wider">
                      Live Autonomous Pipeline
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  <span>Agent Synchronized</span>
                </div>
              </div>

              {/* Match Score Radar Metric */}
              <div className="p-4 rounded-xl bg-[#F7F5EF] border border-[#E6E5DC] mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#202722] flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-[#FF7058]" />
                    <span>Candidate Precision Rating</span>
                  </span>
                  <span className="font-serif text-lg font-bold text-[#123B32]">96.4%</span>
                </div>
                {/* Visual Progress Bar */}
                <div className="w-full h-2 rounded-full bg-stone-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#123B32] via-[#388E7B] to-[#FF7058]"
                    style={{ width: "96.4%" }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-[#777D74] mt-1.5">
                  <span>Semantic Keyword Alignment: 98%</span>
                  <span>Impact Metrics: 95%</span>
                </div>
              </div>

              {/* Applications Feed in Editorial Style */}
              <div className="space-y-3">
                {[
                  {
                    role: "Staff Software Engineer",
                    org: "Stripe",
                    badge: "Direct ATS Match",
                    match: "98%",
                    status: "Submitted & Delivered",
                  },
                  {
                    role: "Principal Product Designer",
                    org: "Linear",
                    badge: "Portfolio Calibrated",
                    match: "95%",
                    status: "Interview Request Received",
                    interview: true,
                  },
                  {
                    role: "Lead Systems Architect",
                    org: "Vercel",
                    badge: "Tailored Cover Letter",
                    match: "94%",
                    status: "Under Recruiter Review",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-lg border border-[#E6E5DC] bg-white hover:border-[#123B32]/30 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#202722]">{item.role}</span>
                        <span className="text-[10px] text-[#777D74]">@{item.org}</span>
                      </div>
                      <span className="text-[10px] text-[#777D74]">{item.badge}</span>
                    </div>

                    <div className="text-right flex items-center gap-2">
                      <div className="text-[11px] font-bold text-[#123B32] bg-[#A9BBA7]/25 px-2 py-0.5 rounded">
                        {item.match}
                      </div>
                      {item.interview ? (
                        <span className="text-[10px] font-semibold text-[#FF7058] bg-[#FF7058]/10 px-2 py-0.5 rounded">
                          Interview
                        </span>
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#123B32]" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Card Footer Metric */}
              <div className="mt-5 pt-3 border-t border-[#E6E5DC] flex items-center justify-between text-xs text-[#777D74]">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#123B32]" />
                  <span>Verified Recruiter Network</span>
                </span>
                <span className="font-semibold text-[#123B32]">500+ Active Roles</span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Editorial Trust Matrix Section */}
        <div className="pt-10 border-t border-[#E6E5DC] grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
          {[
            {
              title: "Autonomous Matching",
              desc: "Multi-parameter parsing of skills, titles, and requirements.",
            },
            {
              title: "ATS Optimization",
              desc: "Instant resume diagnostic and keyword calibration scoring.",
            },
            {
              title: "Verified Hiring Network",
              desc: "Authorizer-governed recruiter postings with verified intent.",
            },
            {
              title: "Private & Governed",
              desc: "Zero unwanted resume scraping. You control every transmission.",
            },
          ].map((item, idx) => (
            <div key={idx} className="space-y-1">
              <h4 className="font-serif text-base text-[#123B32] font-bold">{item.title}</h4>
              <p className="text-xs text-[#777D74] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
