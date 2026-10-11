import { motion } from "framer-motion";
import { ArrowRight, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";

const ServicesSection = () => {
  const navigate = useNavigate();
  const { services, loading, error, retry } = useServiceCatalog();

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

        {loading && <p className="text-center text-sm text-muted-foreground" aria-live="polite">Loading available services…</p>}
        {error && <div className="text-center text-sm text-muted-foreground" role="status">Service categories could not be loaded. <button type="button" onClick={retry} className="underline">Retry</button></div>}
        {!loading && !error && services.length === 0 && <p className="text-center text-sm text-muted-foreground">No services are currently available in this region.</p>}
        {!loading && !error && services.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {services.map((service, index) => (
            <motion.div
              key={service.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              onClick={() => navigate(`/create-job?service=${encodeURIComponent(service.slug)}`)}
              className="group cursor-pointer"
            >
              <div className="p-5 bg-card border border-border rounded-2xl hover:shadow-md transition-all hover:-translate-y-1 group-hover:border-primary/30">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <Wrench className="w-6 h-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{service.title}</h3>
                {service.description && <p className="text-xs text-muted-foreground mb-2">{service.description}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">Find a professional</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>}
      </div>
    </section>
  );
};

export default ServicesSection;
