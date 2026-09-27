import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface Testimonial {
  name: string;
  role: string;
  rating: number;
  text: string;
}

const TestimonialsSection = () => {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTestimonials = async () => {
      try {
        // Attempt to fetch real reviews from the backend
        const res = await apiClient.request('/fundi/ratings?limit=6', { includeAuth: false }) as { ratings?: Record<string, unknown>[] };
        if (res?.ratings && res.ratings.length > 0) {
          const mapped: Testimonial[] = res.ratings.map((r) => ({
            name: (r.customerName as string) || 'Customer',
            role: 'Verified Customer',
            rating: typeof r.rating === 'number' ? r.rating : 5,
            text: (r.comment as string) || 'Great service!',
          }));
          setTestimonials(mapped);
        }
      } catch {
        // silently fail — no testimonials shown
      } finally {
        setLoading(false);
      }
    };

    fetchTestimonials();
  }, []);

  if (loading || testimonials.length === 0) return null;

  return (
    <section className="py-16 md:py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Loved by <span className="text-gradient-primary">thousands</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            See what our customers have to say about their PataFundi experience
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="p-6 bg-card border border-border rounded-2xl"
            >
              <div className="flex gap-1 mb-3">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">"{testimonial.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                  {testimonial.name[0]}
                </div>
                <div>
                  <p className="font-semibold text-sm">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
