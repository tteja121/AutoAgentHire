import { motion } from "framer-motion";
import { Sparkles, FileCheck, BrainCircuit, PenTool, ShieldCheck, BarChart4, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

const features = [
  {
    icon: BrainCircuit,
    category: "Algorithmic Matching",
    title: "Multi-Parameter Semantic Matching",
    description: "Evaluates technical depth, seniority, stack alignment, and role expectations beyond brittle keyword lookups.",
    badge: "96.4% Precision",
  },
  {
    icon: FileCheck,
    category: "ATS Calibration",
    title: "Dynamic Resume Diagnostic",
    description: "Identifies ATS parsing bottlenecks, keyword voids, and structural vulnerabilities before human recruiters screen your resume.",
    badge: "Instant Audit",
  },
  {
    icon: PenTool,
    category: "Custom Tailoring",
    title: "Contextual Cover Letter Synthesis",
    description: "Generates tailored, high-signal narrative pitches highlighting exact career victories matching each vacancy.",
    badge: "LLM Synthesized",
  },
  {
    icon: ShieldCheck,
    category: "Governance",
    title: "Verified Recruiter Pipeline",
    description: "Only Authorizer-verified corporate recruiters post roles, ensuring zero phantom listings, spam, or outdated requisitions.",
    badge: "Enterprise Verified",
  },
  {
    icon: BarChart4,
    category: "Telemetry",
    title: "Unified Application Tracking",
    description: "Live stages, recruiter review timestamps, interview invites, and outcome metrics in one consolidated view.",
    badge: "Real-Time",
  },
  {
    icon: Sparkles,
    category: "Autonomy",
    title: "Scheduled Agent Application Flows",
    description: "Configurable application quotas that execute on your parameters, respecting your pace and career boundaries.",
    badge: "Autonomous",
  },
];

export const FeaturesSection = () => {
  return (
    <section className="py-24 px-6 lg:px-8 bg-[#F7F5EF] relative border-t border-[#E6E5DC]">
      <div className="max-w-7xl mx-auto">
        {/* Editorial Section Heading */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 pb-8 border-b border-[#E6E5DC]">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E6E5DC] text-xs font-semibold uppercase tracking-wider text-[#123B32] mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF7058]" />
              <span>Engine Capabilities</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-5xl text-[#123B32] font-normal tracking-tight leading-tight">
              Architectural Precision for High-Impact Careers.
            </h2>
          </div>
          <div className="mt-4 md:mt-0 text-left md:text-right">
            <p className="text-sm text-[#777D74] max-w-xs leading-relaxed">
              Engineered to replace high-volume blind applying with strategic, high-conversion career placement.
            </p>
          </div>
        </div>

        {/* Features Asymmetric Editorial Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feat, index) => {
            const Icon = feat.icon;
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                viewport={{ once: true }}
                className="group relative rounded-xl bg-white border border-[#E6E5DC] p-8 transition-all duration-300 hover:border-[#123B32]/40 hover:shadow-lg editorial-card-hover flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-11 h-11 rounded-lg bg-[#F7F5EF] text-[#123B32] flex items-center justify-center border border-[#E6E5DC] group-hover:bg-[#123B32] group-hover:text-[#F7F5EF] transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-[#F7F5EF] text-[#777D74] border border-[#E6E5DC]">
                      {feat.badge}
                    </span>
                  </div>

                  <span className="text-[11px] font-semibold tracking-wider uppercase text-[#FF7058] block mb-2">
                    {feat.category}
                  </span>

                  <h3 className="font-serif text-xl text-[#123B32] font-bold mb-3 leading-snug">
                    {feat.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#777D74] leading-relaxed mb-6 font-sans">
                    {feat.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#E6E5DC] flex items-center justify-between text-xs font-semibold text-[#123B32] group-hover:text-[#FF7058] transition-colors">
                  <span>Explore Protocol</span>
                  <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
