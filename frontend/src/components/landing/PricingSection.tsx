import { motion } from "framer-motion";
import { Check, Sparkles, Briefcase, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface PricingCardProps {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  buttonText: string;
  buttonVariant: "hero" | "outline" | "default";
  isPopular?: boolean;
  delay?: number;
}

const PricingCard = ({
  name,
  price,
  period,
  description,
  features,
  buttonText,
  buttonVariant,
  isPopular,
  delay = 0,
}: PricingCardProps) => {
  const planKey = name.toLowerCase();
  const signupUrl = `/signup?plan=${planKey}`;

  const handleSelectPlan = () => {
    try {
      localStorage.setItem("selectedPlan", planKey);
    } catch (e) {
      // ignore
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      viewport={{ once: true }}
      className={`relative p-8 rounded-2xl backdrop-blur-xl border transition-all duration-300 hover:-translate-y-2 ${
        isPopular
          ? "bg-gradient-to-b from-primary/20 to-card/80 border-primary/40 shadow-xl shadow-primary/20"
          : "bg-card/60 border-white/10 hover:border-primary/30"
      }`}
    >
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-sm font-semibold rounded-full flex items-center gap-1 shadow-md shadow-primary/30">
          <Sparkles className="w-3 h-3" /> Most Popular
        </div>
      )}

      <div className="text-center mb-8">
        <h3 className="text-xl font-semibold mb-2 text-foreground">{name}</h3>
        <p className="text-muted-foreground text-sm mb-4">{description}</p>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-5xl font-bold font-display gradient-text">{price}</span>
          <span className="text-muted-foreground">{period}</span>
        </div>
      </div>

      <ul className="space-y-4 mb-8">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Check className="w-3 h-3 text-success" />
            </div>
            <span className="text-foreground/80 text-sm">{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={buttonVariant}
        size="lg"
        className="w-full shadow-md"
        asChild
        onClick={handleSelectPlan}
      >
        <Link to={signupUrl}>
          {buttonText}
        </Link>
      </Button>
    </motion.div>
  );
};

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Perfect for getting started",
    features: [
      "5 applications per day",
      "Basic job matching",
      "Resume upload",
      "Email support",
    ],
    buttonText: "Start Free",
    buttonVariant: "outline" as const,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "Best for active job seekers",
    features: [
      "25 applications per day",
      "AI-powered matching",
      "Custom cover letters",
      "Priority support",
      "Advanced analytics",
      "Resume optimization",
    ],
    buttonText: "Start Pro Trial",
    buttonVariant: "hero" as const,
    isPopular: true,
  },
  {
    name: "Enterprise",
    price: "$99",
    period: "/month",
    description: "For power users",
    features: [
      "Unlimited applications",
      "Dedicated account manager",
      "Custom integrations",
      "API access",
      "White-label options",
      "SLA guarantee",
    ],
    buttonText: "Contact Sales",
    buttonVariant: "outline" as const,
  },
];

export const PricingSection = () => {
  return (
    <section id="pricing" className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Choose Your <span className="gradient-text">Plan</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Start free and upgrade as you grow. All plans include a 14-day money-back guarantee.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <PricingCard key={plan.name} {...plan} delay={index * 0.15} />
          ))}
        </div>

        {/* Create Account for Recruiters Section Below Choose Your Plan */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
          className="mt-16 p-8 rounded-3xl bg-gradient-to-r from-card/80 via-card/90 to-card/80 border border-white/10 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center flex-shrink-0 text-white shadow-lg shadow-primary/25">
              <Briefcase className="w-8 h-8" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-1 border border-primary/20">
                Authorizer-Verified Employer Network
              </div>
              <h3 className="text-2xl font-bold text-foreground">Hiring Talent for Your Company?</h3>
              <p className="text-muted-foreground text-sm max-w-xl mt-1">
                Recruiter accounts are activated upon Authorizer verification. Submit your organization request to post vacancies, set Pacific Time deadlines, and access candidate CVs.
              </p>
            </div>
          </div>

          <Button
            variant="hero"
            size="xl"
            asChild
            className="flex-shrink-0 shadow-lg shadow-primary/20"
          >
            <Link to="/recruiter/register" className="flex items-center gap-2">
              <span>Create Account for Recruiters</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};
