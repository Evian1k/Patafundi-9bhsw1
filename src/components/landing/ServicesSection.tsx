import { motion } from "framer-motion";
import {
  Wrench,
  Zap,
  Droplets,
  Wind,
  Hammer,
  Sparkles,
  Car,
  PaintBucket,
  ArrowRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const services = [
  { icon: Droplets, name: "Plumbing", description: "Leaks, pipes, installations", color: "from-blue-500 to-cyan-500", jobs: "15K+ jobs", slug: "plumbing" },
  { icon: Zap, name: "Electrical", description: "Wiring, repairs, installations", color: "from-yellow-500 to-orange-500", jobs: "12K+ jobs", slug: "electrical" },
  { icon: Wind, name: "AC & HVAC", description: "Cooling, heating, maintenance", color: "from-sky-500 to-blue-500", jobs: "8K+ jobs", slug: "hvac" },
  { icon: Sparkles, name: "Cleaning", description: "Home, office, deep cleaning", color: "from-emerald-500 to-teal-500", jobs: "25K+ jobs", slug: "cleaning" },
  { icon: Hammer, name: "Carpentry", description: "Furniture, repairs, custom work", color: "from-amber-500 to-yellow-600", jobs: "6K+ jobs", slug: "carpentry" },
  { icon: Car, name: "Auto Repair", description: "Mechanics, diagnostics, service", color: "from-red-500 to-rose-500", jobs: "10K+ jobs", slug: "auto" },
  { icon: PaintBucket, name: "Painting", description: "Interior, exterior, finishing", color: "from-purple-500 to-pink-500", jobs: "7K+ jobs", slug: "painting" },
  { icon: Wrench, name: "General Repair", description: "Handyman, misc repairs", color: "from-gray-500 to-slate-500", jobs: "20K+ jobs", slug: "general" },
];

const ServicesSection = () => {
  const navigate = useNavigate();

  return (
    <section className="py-16 md:py-24" id="services">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Services for <span className="text-gradient-primary">everything</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            From quick fixes to major projects, find verified professionals for any job
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {services.map((service, index) => (
            <motion.div
              key={service.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              onClick={() => navigate(`/create-job?service=${encodeURIComponent(service.name)}`)}
              className="group cursor-pointer"
            >
              <div className="p-5 bg-card border border-border rounded-2xl hover:shadow-md transition-all hover:-translate-y-1 group-hover:border-primary/30">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-3`}>
                  <service.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{service.name}</h3>
                <p className="text-xs text-muted-foreground mb-2">{service.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">{service.jobs}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
