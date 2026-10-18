import { motion } from "framer-motion";
import { Bot, ArrowRight, Sparkles, Briefcase, CheckCircle2, TrendingUp, Zap, FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const HeroSection = () => {
  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden pt-24 pb-16">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 hero-gradient pointer-events-none" />
      <div className="absolute inset-0 floating-particles opacity-30 pointer-events-none" />
      
      {/* Glowing ambient light orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-primary/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-72 h-72 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 text-center">
        {/* Floating badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs sm:text-sm font-semibold mb-6 shadow-sm backdrop-blur-md"
        >
          <Sparkles className="w-4 h-4 text-primary animate-pulse" />
          <span>Autonomous AI Job Application Agent</span>
        </motion.div>

        {/* Main heading */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black mb-6 tracking-tight leading-[1.1]"
        >
          Automate Your{" "}
          <span className="gradient-text">Job Hunt</span>
          <br />
          with Intelligent AI
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed font-normal"
        >
          Upload your resume once. Our autonomous agent matches your skills, tailors ATS cover letters, and applies to verified opportunities 24/7.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6"
        >
          <Button variant="hero" size="xl" asChild className="shadow-xl shadow-primary/25 px-8 h-13 text-base">
            <Link to="/signup" className="group flex items-center gap-2">
              <span>Start Free Automation</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>

          <Button
            variant="heroOutline"
            size="xl"
            asChild
            className="hover:border-primary/50 px-8 h-13 text-base"
          >
            <Link to="/candidate/jobs" className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" />
              <span>Explore Verified Jobs</span>
            </Link>
          </Button>
        </motion.div>

        {/* Recruiter link pill */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-14"
        >
          <Link
            to="/recruiter/register"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1 px-3 rounded-full hover:bg-white/5 border border-transparent hover:border-white/10"
          >
            <span>Hiring for your team?</span>
            <span className="text-primary font-medium underline underline-offset-2">Create a verified recruiter account →</span>
          </Link>
        </motion.div>

        {/* Stats highlight cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-16"
        >
          {[
            { value: "10,000+", label: "Applications Automated", icon: Zap },
            { value: "98%", label: "ATS Match Precision", icon: TrendingUp },
            { value: "500+", label: "Verified Employers", icon: Briefcase },
            { value: "24/7", label: "Autonomous Agent", icon: Bot },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="p-4 rounded-2xl bg-card/40 border border-white/5 backdrop-blur-md flex flex-col items-center justify-center transition-transform hover:-translate-y-1 hover:border-primary/20"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold font-display gradient-text">{stat.value}</div>
                <div className="text-muted-foreground text-xs font-medium mt-0.5">{stat.label}</div>
              </div>
            );
          })}
        </motion.div>

        {/* Product showcase preview */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="relative max-w-5xl mx-auto"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
          
          <div className="rounded-3xl border border-primary/20 shadow-2xl shadow-primary/20 bg-card/80 backdrop-blur-2xl p-4 sm:p-6 text-left relative overflow-hidden">
            {/* Top window chrome bar */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-xs text-muted-foreground font-mono hidden sm:inline-block">
                  AutoAgentHire — Live Application Dashboard
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-semibold text-emerald-400">Agent Active</span>
              </div>
            </div>

            {/* Quick status bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Today's Goal</span>
                <span className="text-sm font-bold text-foreground">24 / 25 Applied</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Average ATS Match</span>
                <span className="text-sm font-bold text-primary">96.8% Score</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Active LLM Engine</span>
                <span className="text-sm font-bold text-foreground">Gemini 2.0 Flash</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Target Location</span>
                <span className="text-sm font-bold text-foreground">Remote & Hybrid</span>
              </div>
            </div>

            {/* Simulated Live Automated Applications List */}
            <div className="space-y-3">
              {[
                {
                  title: "Senior Full-Stack Engineer",
                  company: "TechCorp Global",
                  location: "Remote (US/Global)",
                  match: "98%",
                  status: "Application Submitted via AI Agent",
                  badge: "Custom Cover Letter Attached",
                  time: "10 mins ago",
                },
                {
                  title: "Lead Frontend Developer (React / TS)",
                  company: "CloudScale Systems",
                  location: "San Francisco, CA (Hybrid)",
                  match: "95%",
                  status: "Interview Request Received",
                  badge: "Reviewing Application",
                  time: "2 hours ago",
                  interview: true,
                },
                {
                  title: "AI Platform & Backend Architect",
                  company: "Nova Intelligence",
                  location: "Remote",
                  match: "94%",
                  status: "Resume Parsed & Submitted",
                  badge: "Skills Verified by LLM",
                  time: "5 hours ago",
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 sm:p-4 rounded-xl bg-navy-900/60 border border-white/10 hover:border-primary/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-blue-500/20 text-primary border border-primary/20 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {item.company.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{item.title}</span>
                        <span className="text-xs text-muted-foreground">• {item.company}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{item.location}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-bold">
                        <Sparkles className="w-3 h-3" />
                        <span>{item.match} Match</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">{item.time}</span>
                    </div>
                    {item.interview ? (
                      <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Interview</span>
                      </div>
                    ) : (
                      <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-muted-foreground text-xs font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                        <span>Applied</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
