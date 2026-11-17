import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    quote: "The ATS calibration identified two critical keyword voids in my distributed systems experience. Within four days of deploying the agent, I received two interview requests from Tier-1 engineering teams.",
    name: "Elena Rostova",
    role: "Staff Infrastructure Engineer",
    company: "Series B Cloud Infrastructure",
  },
  {
    quote: "Most job automation tools blast generic resumes and get you blacklisted. AutoAgentHire does the opposite: it generates bespoke, highly context-aware cover letters that hiring managers actually compliment.",
    name: "Marcus Vance",
    role: "Principal Product Architect",
    company: "Enterprise AI Platform",
  },
  {
    quote: "As a recruiter, the difference between applicants from AutoAgentHire and raw inbound is night and day. The match scores are accurate and candidate summaries highlight exact technical competencies.",
    name: "Claire D'Souza",
    role: "Head of Talent Acquisition",
    company: "FinTech Scale-up",
  },
];

export const TestimonialsSection = () => {
  return (
    <section className="py-24 px-6 lg:px-8 bg-[#F7F5EF] relative border-t border-[#E6E5DC]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs uppercase tracking-widest text-[#FF7058] font-bold block mb-3">
            Editorial Perspectives
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl text-[#123B32] font-normal tracking-tight leading-tight mb-4">
            Proven Conversions in High-Signal Hiring.
          </h2>
          <p className="text-sm text-[#777D74] leading-relaxed">
            Engineers, executives, and talent partners who transformed their pipeline through autonomous intelligence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((item, idx) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              viewport={{ once: true }}
              className="p-8 rounded-xl bg-white border border-[#E6E5DC] editorial-shadow editorial-card-hover flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-1 mb-5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-[#FF7058] text-[#FF7058]" />
                  ))}
                </div>

                <Quote className="w-8 h-8 text-[#A9BBA7]/40 mb-3" />

                <p className="font-serif text-base text-[#202722] leading-relaxed mb-6 italic">
                  "{item.quote}"
                </p>
              </div>

              <div className="pt-4 border-t border-[#E6E5DC]">
                <h4 className="font-serif text-sm font-bold text-[#123B32]">{item.name}</h4>
                <div className="text-xs text-[#777D74]">{item.role}</div>
                <div className="text-[11px] text-[#A9BBA7] font-medium">{item.company}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
