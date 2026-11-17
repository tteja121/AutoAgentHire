import { motion } from "framer-motion";
import { Check, ArrowRight, UserCheck, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const PricingSection = () => {
  return (
    <section id="get-started" className="py-24 px-6 lg:px-8 bg-[#F7F5EF] relative border-t border-[#E6E5DC]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs uppercase tracking-widest text-[#FF7058] font-bold block mb-3">
            Ecosystem Access
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl text-[#123B32] font-normal tracking-tight leading-tight mb-4">
            Select Your Operating Portal.
          </h2>
          <p className="text-sm text-[#777D74] leading-relaxed">
            Tailored capabilities for candidates demanding an intelligent edge and recruiters sourcing calibrated technical talent.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Candidate Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="p-8 sm:p-10 rounded-2xl bg-white border border-[#E6E5DC] editorial-shadow flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-lg bg-[#F7F5EF] text-[#123B32] flex items-center justify-center border border-[#E6E5DC]">
                  <UserCheck className="w-6 h-6 text-[#123B32]" />
                </div>
                <span className="text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Candidate Access
                </span>
              </div>

              <h3 className="font-serif text-2xl font-bold text-[#123B32] mb-3">
                Intelligent Job Seeker Suite
              </h3>
              <p className="text-xs sm:text-sm text-[#777D74] leading-relaxed mb-6 font-sans">
                Deploy autonomous search agents, evaluate ATS compliance scores, and apply to vetted corporate openings with precision tailored cover letters.
              </p>

              <div className="editorial-rule my-6" />

              <ul className="space-y-3.5 mb-8">
                {[
                  "Dynamic ATS resume diagnostic & gap detection",
                  "Automated role matching with percentage scores",
                  "One-click tailored cover letter generation",
                  "Live application tracking & recruiter status updates",
                  "Direct access to Authorizer-verified corporate roles",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-xs sm:text-sm text-[#202722]">
                    <div className="w-4 h-4 rounded-full bg-[#123B32]/10 text-[#123B32] flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              asChild
              className="w-full bg-[#FF7058] hover:bg-[#FA5D42] text-white font-semibold h-12 rounded-lg shadow-sm"
            >
              <Link to="/signup" className="flex items-center justify-center gap-2">
                <span>Create Free Candidate Account</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </motion.div>

          {/* Recruiter Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            viewport={{ once: true }}
            className="p-8 sm:p-10 rounded-2xl bg-[#123B32] text-[#F7F5EF] border border-[#123B32] editorial-shadow flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-lg bg-white/10 text-[#FF7058] flex items-center justify-center border border-white/10">
                  <Briefcase className="w-6 h-6 text-[#FF7058]" />
                </div>
                <span className="text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full bg-white/10 text-[#A9BBA7] border border-white/10">
                  Enterprise Recruiter
                </span>
              </div>

              <h3 className="font-serif text-2xl font-bold text-[#F7F5EF] mb-3">
                Verified Recruiter Workspace
              </h3>
              <p className="text-xs sm:text-sm text-[#A9BBA7] leading-relaxed mb-6 font-sans">
                Post positions under Authorizer governance, review pre-parsed candidate resumes with match rankings, and trigger interview workflows.
              </p>

              <div className="h-px bg-white/10 my-6" />

              <ul className="space-y-3.5 mb-8">
                {[
                  "Authorizer-approved corporate job publishing",
                  "Pre-scored applicant queues with resume extraction",
                  "Integrated review statuses (Shortlisted, Interview, Offer)",
                  "Automatic notification tracking & audit logs",
                  "Official corporate domain authentication",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-xs sm:text-sm text-[#E6E5DC]">
                    <div className="w-4 h-4 rounded-full bg-[#FF7058]/20 text-[#FF7058] flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              variant="outline"
              asChild
              className="w-full border-white/20 hover:border-white bg-white/5 text-white hover:bg-white/10 font-semibold h-12 rounded-lg"
            >
              <Link to="/recruiter/register" className="flex items-center justify-center gap-2">
                <span>Request Recruiter Access</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
