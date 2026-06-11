import { motion } from "framer-motion";
import { ArrowRight, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const CTASection = () => {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Customer CTA */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="p-8 bg-gradient-primary rounded-3xl text-white"
          >
            <h3 className="text-2xl font-display font-bold mb-3">Need something fixed?</h3>
            <p className="text-white/80 mb-6 leading-relaxed">
              Get connected with verified professionals in minutes.
              Fast, reliable, and secure.
            </p>
            <Link to="/register/customer">
              <Button variant="secondary" className="bg-white text-primary hover:bg-white/90">
                Register as Customer
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </motion.div>

          {/* Fundi CTA */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="p-8 bg-foreground rounded-3xl text-background"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
              <Briefcase className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xs font-medium text-primary uppercase tracking-wider">For Professionals</span>
            <h3 className="text-2xl font-display font-bold mt-1 mb-3 text-background">Grow your business</h3>
            <p className="text-background/70 mb-6 leading-relaxed">
              Join thousands of fundis earning more with PataFundi.
              Get verified, get jobs, get paid directly.
            </p>
            <Link to="/register/fundi">
              <Button className="bg-primary hover:bg-primary/90">
                Register as Fundi
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
