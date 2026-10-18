import { motion } from "framer-motion";
import { Check, Sparkles, Briefcase, ArrowRight, Bot, ShieldCheck, Video, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const PricingSection = () => {
  return (
    <section id="get-started" className="py-24 px-4 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent pointer-events-none" />
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs sm:text-sm font-semibold mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Built for the Modern Hiring Ecosystem</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-5 tracking-tight">
            Connecting Top Talent with <span className="gradient-text">Verified Opportunities</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
            Whether you want to automate job applications or source top engineers for your team, AutoAgentHire streamlines every step.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Card 1: For Job Seekers */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="p-8 sm:p-10 rounded-3xl bg-gradient-to-b from-card/90 to-card/60 border border-white/10 hover:border-primary/40 backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 shadow-2xl relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center text-white shadow-lg shadow-primary/25">
                  <Bot className="w-7 h-7" />
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary">
                  For Candidates
                </span>
              </div>

              <h3 className="text-2xl font-bold mb-3 text-foreground">Automate Your Applications</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                Upload your resume once and let autonomous AI extract skills, calculate ATS match scores against open vacancies, and auto-submit with custom tailored cover letters.
              </p>

              <ul className="space-y-3.5 mb-8">
                {[
                  "Intelligent AI Resume Parsing & Skill Discovery",
                  "Automated High-Score Job Matching (up to 98% precision)",
                  "Custom Context-Aware Cover Letters Generated Instantly",
                  "Real-Time Application Status & History Tracking",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-emerald-400 font-bold" />
                    </div>
                    <span className="text-sm text-foreground/90 font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              variant="hero"
              size="lg"
              className="w-full shadow-lg shadow-primary/25 h-12 text-sm font-semibold"
              asChild
            >
              <Link to="/signup" className="flex items-center justify-center gap-2">
                <span>Start Free Application Automation</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </motion.div>

          {/* Card 2: For Employers & Recruiters */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            className="p-8 sm:p-10 rounded-3xl bg-gradient-to-b from-card/90 to-card/60 border border-white/10 hover:border-blue-500/40 backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 shadow-2xl relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
                  <Briefcase className="w-7 h-7" />
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400">
                  For Recruiters & Employers
                </span>
              </div>

              <h3 className="text-2xl font-bold mb-3 text-foreground">Hire Top Technical Talent</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                Post authorized job opportunities, inspect extracted resume skills and candidate CVs in the browser, update application status, and schedule interviews with Google Meet.
              </p>

              <ul className="space-y-3.5 mb-8">
                {[
                  "Post Verified Job Openings with Pacific Time Deadlines",
                  "AI-Powered Resume Analysis & Instant Skill Classification",
                  "Direct Document Preview (PDF / DOCX) in the Browser",
                  "Integrated Interview Scheduling with Calendar Links",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-blue-400 font-bold" />
                    </div>
                    <span className="text-sm text-foreground/90 font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              variant="heroOutline"
              size="lg"
              className="w-full border-blue-500/40 hover:bg-blue-500/10 text-foreground h-12 text-sm font-semibold"
              asChild
            >
              <Link to="/recruiter/register" className="flex items-center justify-center gap-2">
                <span>Create Recruiter Account</span>
                <ArrowRight className="w-4 h-4 text-blue-400" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
