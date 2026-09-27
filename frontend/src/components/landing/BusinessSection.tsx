import { motion } from "framer-motion";
import { Building2, BriefcaseBusiness, BarChart3, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const highlights = [
  {
    icon: Building2,
    title: "Verified company network",
    description: "Give customers access to vetted companies, service branches, and technicians with clear accountability.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Operational control",
    description: "Managers can assign jobs, monitor technician availability, and track customer requests in one workflow.",
  },
  {
    icon: BarChart3,
    title: "Performance visibility",
    description: "Monitor job trends, settlement performance, response times, and repeat customer demand by branch or service.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant-safe data access",
    description: "Company users only see their business data, not platform-wide revenue or other companies' operations.",
  },
];

export default function BusinessSection() {
  return (
    <section className="py-16 md:py-24 bg-secondary/25">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center mb-12"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary mb-3">For companies</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Built for <span className="text-gradient-primary">service businesses</span>
          </h2>
          <p className="text-muted-foreground">
            PataFundi gives verified service companies a safer channel to win demand, assign work, and manage growth without exposing internal platform operations.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          {highlights.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className="p-6 bg-card border border-border rounded-2xl shadow-sm"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 flex justify-center gap-3 flex-wrap">
          <Link to="/companies">
            <Button className="bg-gradient-primary">Explore the company portal</Button>
          </Link>
          <Link to="/demo/company">
            <Button variant="outline">View company demo screen</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
