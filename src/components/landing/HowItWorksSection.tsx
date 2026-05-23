import { motion } from "framer-motion";
import { MessageSquare, UserCheck, CheckCircle, Star } from "lucide-react";

const steps = [
  {
    icon: MessageSquare,
    title: "Describe Your Problem",
    description: "Tell us what needs fixing. Our system will match you with the right professionals.",
    color: "bg-primary",
  },
  {
    icon: UserCheck,
    title: "Get Matched Instantly",
    description: "Verified fundis near you receive your job request and can accept it immediately.",
    color: "bg-accent",
  },
  {
    icon: CheckCircle,
    title: "Job Gets Done",
    description: "Track arrival, monitor progress, and confirm completion with a secure OTP.",
    color: "bg-success",
  },
  {
    icon: Star,
    title: "Rate & Review",
    description: "Help the community by rating your fundi. Great work gets rewarded.",
    color: "bg-warning",
  },
];

const HowItWorksSection = () => {
  return (
    <section className="py-16 md:py-24 bg-secondary/30" id="how-it-works">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            How <span className="text-gradient-primary">FundiHub</span> works
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Getting help is simple. We handle the complexity so you don't have to.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          {/* Connection line */}
          <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-primary via-accent to-warning" />

          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative flex flex-col items-center text-center"
            >
              <div className={`w-16 h-16 rounded-2xl ${step.color} flex items-center justify-center mb-4 shadow-lg relative z-10`}>
                <step.icon className="w-8 h-8 text-white" />
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center z-20">
                {index + 1}
              </div>
              <h3 className="font-semibold text-base mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
