import { motion } from "framer-motion";
import { ArrowRight, MapPin, Zap, Shield, CheckCircle2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/api";

interface PlatformStats {
  verifiedFundis: number;
  jobsCompleted: number;
  averageRating: number;
}

const HeroSection = () => {
  const [problemText, setProblemText] = useState("");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const navigate = useNavigate();

  // Real platform statistics (spec §58: never fabricate numbers). Young
  // platforms honestly show small numbers — the UI degrades to qualitative
  // trust copy until real data exists.
  useEffect(() => {
    let active = true;
    apiClient
      .request("/platform/stats", { includeAuth: false })
      .then((res) => {
        const stats = (res as { stats?: PlatformStats })?.stats;
        if (active) setStats(stats ?? null);
      })
      .catch(() => {
        /* stats are decorative-if-real; silently fall back to qualitative copy */
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (problemText.trim()) {
      navigate(`/create-job?problem=${encodeURIComponent(problemText)}`);
    } else {
      navigate("/create-job");
    }
  };

  const hasRealStats = stats && (stats.verifiedFundis > 0 || stats.jobsCompleted > 0);

  const statItems = hasRealStats
    ? [
        { value: `${stats!.verifiedFundis.toLocaleString()}`, label: "Verified Fundis" },
        { value: `${stats!.jobsCompleted.toLocaleString()}`, label: "Jobs Completed" },
        {
          value: stats!.averageRating > 0 ? `${stats!.averageRating.toFixed(1)}★` : "New",
          label: "Average Rating",
        },
      ]
    : [
        { value: "Verified", label: "Every Fundi" },
        { value: "Escrow", label: "Protected Payments" },
        { value: "Live", label: "Job Tracking" },
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
              Verified professionals you can trust
            </motion.div>

            {/* Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl sm:text-6xl font-display font-extrabold leading-tight mb-6"
            >
              Real problems.{" "}
              <span className="text-gradient-primary">Real professionals.</span>
              <br />
              One place.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-muted-foreground text-lg leading-relaxed mb-8"
            >
              Find a trusted professional or service company near you — for plumbing, electrical, cleaning,
              repairs and more. Book, track and pay securely in one app.
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

            {/* Stats — real values only */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex gap-8 mt-10"
            >
              {statItems.map((stat) => (
                <div key={stat.label}>
                  <p className="text-2xl font-display font-extrabold text-gradient-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — illustrative product flow (no fabricated metrics) */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="relative hidden md:flex items-center justify-center"
          >
            <div className="w-full max-w-sm bg-card rounded-3xl shadow-xl border border-border/50 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold">From problem to done</p>
                  <p className="text-xs text-muted-foreground">Track every step in real time</p>
                </div>
              </div>

              <ol className="space-y-3 mb-5">
                {[
                  { label: "Describe your problem", done: true },
                  { label: "Match with a verified professional", done: true },
                  { label: "Track them arriving on the map", done: false },
                  { label: "Pay securely when the work is done", done: false },
                ].map(({ label, done }) => (
                  <li key={label} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border-2 border-border shrink-0" />
                    )}
                    <span className={done ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{label}</span>
                  </li>
                ))}
              </ol>

              <div className="flex gap-2">
                <div className="flex-1 h-10 rounded-xl bg-primary flex items-center justify-center text-sm text-white font-medium">
                  Get started
                </div>
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Floating escrow badge */}
            <div className="absolute -top-4 -right-4 bg-card rounded-2xl shadow-lg border border-border/50 px-3 py-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium">Escrow protected</span>
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
