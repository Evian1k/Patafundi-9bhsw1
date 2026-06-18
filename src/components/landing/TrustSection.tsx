import { motion } from "framer-motion";
import { Shield, CreditCard, Clock, HeadphonesIcon } from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "Verified Professionals",
    description: "Every fundi is background-checked and skill-verified before joining our platform.",
    color: "text-primary bg-primary/10",
  },
  {
    icon: CreditCard,
    title: "Secure Payments",
    description: "Pay only after the job is done. Payments go through M-Pesa with full protection.",
    color: "text-accent bg-accent/10",
  },
  {
    icon: Clock,
    title: "Real-time Tracking",
    description: "Know exactly when your fundi arrives and track job progress live.",
    color: "text-blue-600 bg-blue-50",
  },
  {
    icon: HeadphonesIcon,
    title: "24/7 Support",
    description: "Our support team is always here to help resolve any issues quickly.",
    color: "text-green-600 bg-green-50",
  },
];

const TrustSection = () => {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Your safety is our <span className="text-gradient-accent">priority</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            We've built multiple layers of protection to ensure every job goes smoothly.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="p-6 bg-card border border-border rounded-2xl hover:shadow-md transition-all"
            >
              <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-4`}>
                <feature.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustSection;
