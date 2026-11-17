import { motion } from "framer-motion";
import { FileUp, Cpu, SendHorizontal, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const steps = [
  {
    step: "01",
    icon: FileUp,
    title: "Ingestion & ATS Calibration",
    description: "Upload your resume in PDF format. Our neural parser extracts competencies, evaluates ATS readability, and identifies critical keyword opportunities.",
    detail: "Average calibration time: 14 seconds",
  },
  {
    step: "02",
    icon: Cpu,
    title: "Multi-Vector Role Matching",
    description: "The engine screens verified requisitions against your seniority, tech stack, and salary goals, computing a match confidence index for each position.",
    detail: "500+ corporate positions parsed daily",
  },
  {
    step: "03",
    icon: SendHorizontal,
    title: "Autonomous Delivery & Tracking",
    description: "Tailored applications are generated and dispatched with custom cover letters directly to verified recruiters, with complete audit logs in your dashboard.",
    detail: "Instant confirmation & review telemetry",
  },
];

export const HowItWorksSection = () => {
  return (
    <section className="py-24 px-6 lg:px-8 bg-[#123B32] text-[#F7F5EF] relative overflow-hidden">
      {/* Decorative Editorial Watermark */}
      <div className="absolute left-[-2%] top-[10%] text-[120px] font-serif text-white/[0.03] select-none pointer-events-none leading-none">
        Protocol
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 pb-8 border-b border-white/10">
          <div className="max-w-2xl">
            <span className="text-xs uppercase tracking-widest text-[#FF7058] font-bold block mb-3">
              Operational Sequence
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl text-[#F7F5EF] font-normal tracking-tight leading-tight">
              From Upload to Interview in Three Strategic Steps.
            </h2>
          </div>
          <p className="mt-4 md:mt-0 text-sm text-[#A9BBA7] max-w-xs leading-relaxed">
            Eliminate hours of manual form-filling with an autonomous pipeline engineered for maximum callback conversion.
          </p>
        </div>

        {/* Step Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {steps.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: idx * 0.15 }}
                viewport={{ once: true }}
                className="relative p-8 rounded-xl bg-white/[0.04] border border-white/10 hover:border-[#FF7058]/50 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  {/* Step Number & Icon */}
                  <div className="flex items-center justify-between mb-8">
                    <span className="font-serif text-3xl font-bold text-[#FF7058]">
                      {item.step}
                    </span>
                    <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[#A9BBA7]">
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>

                  <h3 className="font-serif text-2xl font-bold text-[#F7F5EF] mb-3 leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#A9BBA7] leading-relaxed mb-6 font-sans">
                    {item.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-[#E6E5DC]/80 font-mono">
                  <span>{item.detail}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA Banner */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-left">
            <h4 className="font-serif text-xl text-white font-bold mb-1">
              Ready to deploy your personal career agent?
            </h4>
            <p className="text-xs text-[#A9BBA7]">
              Free candidate onboarding includes instant ATS evaluation and 5 free automated submissions.
            </p>
          </div>
          <Button
            asChild
            className="bg-[#FF7058] hover:bg-[#FA5D42] text-white text-xs font-semibold px-6 py-3 rounded-lg shadow-md shrink-0"
          >
            <Link to="/signup" className="flex items-center gap-2">
              <span>Activate Free Agent</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
