import { motion } from "framer-motion";
import { ArrowRight, MapPin, Zap, Shield, Star, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const HeroSection = () => {
  const [problemText, setProblemText] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (problemText.trim()) {
      navigate(`/create-job?problem=${encodeURIComponent(problemText)}`);
    } else {
      navigate("/create-job");
    }
  };

  const stats = [
    { value: "50K+", label: "Verified Fundis" },
    { value: "200K+", label: "Jobs Completed" },
    { value: "4.9★", label: "Average Rating" },
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-hero min-h-[90vh] flex items-center">
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 -right-20 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -left-20 w-72 h-72 bg-accent/8 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 relative z-10">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <div>
            {/* Trust badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6"
            >
              <Shield className="w-4 h-4" />
              Trusted by 200,000+ customers across East Africa
            </motion.div>

            {/* Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl sm:text-6xl font-display font-extrabold leading-tight mb-6"
            >
              Get it{" "}
              <span className="text-gradient-primary">fixed</span>
              <br />
              in minutes
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-muted-foreground text-lg leading-relaxed mb-8"
            >
              Connect with verified local professionals for plumbing, electrical, cleaning, repairs and more.
              Fast, reliable, and secure.
            </motion.p>

            {/* Problem input */}
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onSubmit={handleSubmit}
              className="flex gap-2 mb-4"
            >
              <div className="flex-1 relative">
                <Wrench className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={problemText}
                  onChange={(e) => setProblemText(e.target.value)}
                  placeholder="Describe your problem..."
                  className="w-full h-14 pl-11 pr-4 bg-card border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm shadow-sm"
                />
              </div>
              <Button type="submit" className="h-14 px-6 bg-gradient-primary rounded-2xl shadow-glow text-sm font-semibold whitespace-nowrap">
                Fix My Problem
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.form>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <MapPin className="w-3.5 h-3.5 text-primary" />
              We'll find the best professionals near you
            </motion.p>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex gap-8 mt-10"
            >
              {stats.map((stat) => (
                <div key={stat.label}>
                  <p className="text-2xl font-display font-extrabold text-gradient-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — decorative cards */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="relative hidden md:flex items-center justify-center"
          >
            {/* Main card */}
            <div className="w-full max-w-sm bg-card rounded-3xl shadow-xl border border-border/50 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold">Fundi Found!</p>
                  <p className="text-xs text-muted-foreground">2.1 km away • 8 min ETA</p>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                {[
                  { label: "Service", value: "Electrical Repair" },
                  { label: "Estimated", value: "KES 1,500" },
                  { label: "Fundi rating", value: "4.9 ⭐" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-sm font-semibold">{value}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="flex-1 h-10 rounded-xl bg-primary flex items-center justify-center text-sm text-white font-medium">
                  Accept Fundi
                </div>
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Floating rating badge */}
            <div className="absolute -top-4 -right-4 bg-card rounded-2xl shadow-lg border border-border/50 px-3 py-2 flex items-center gap-2">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-bold text-sm">4.9</span>
              <span className="text-xs text-muted-foreground">Top rated</span>
            </div>

            {/* Floating verified badge */}
            <div className="absolute -bottom-4 -left-4 bg-card rounded-2xl shadow-lg border border-border/50 px-3 py-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium">Verified Fundi</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
