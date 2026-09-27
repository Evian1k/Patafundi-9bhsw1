import { motion } from "framer-motion";
import { BadgeCheck, Briefcase, Gauge, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const providerFeatures = [
  {
    icon: BadgeCheck,
    title: "Verified onboarding",
    description: "Apply, upload credentials, pass verification, and unlock access to eligible jobs.",
  },
  {
    icon: Briefcase,
    title: "Work management",
    description: "See incoming requests, accept jobs, track progress, and keep your schedule moving.",
  },
  {
    icon: Gauge,
    title: "Performance trust score",
    description: "Ratings, response speed, completion rate, and reliability help build your reputation.",
  },
  {
    icon: Wallet,
    title: "Earnings visibility",
    description: "Track pending, available, and paid funds without exposing unrelated platform data.",
  },
];

export default function ProviderSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center mb-12"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary mb-3">For professionals</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            For the people who <span className="text-gradient-primary">get the work done</span>
          </h2>
          <p className="text-muted-foreground">
            PataFundi gives fundis and companies a fair, structured way to win more jobs, build trust, and manage earnings through a professional service platform.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          {providerFeatures.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className="p-6 bg-card border border-border rounded-2xl shadow-sm"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 flex justify-center gap-4 flex-wrap">
          <Link to="/register/fundi">
            <Button className="bg-gradient-primary">Join as a fundi</Button>
          </Link>
          <Link to="/companies">
            <Button variant="outline">Partner with PataFundi</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
