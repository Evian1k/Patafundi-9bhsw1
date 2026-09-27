import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function About() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-4">About PataFundi</h1>
        <p className="text-muted-foreground text-lg mb-8">
          PataFundi is built to make local services safer, faster, and more reliable — for customers and for professionals.
        </p>

        <div className="space-y-8">
          <div className="p-6 bg-card rounded-2xl border border-border/50">
            <h2 className="text-xl font-semibold mb-3">Mission</h2>
            <p className="text-muted-foreground">
              Connect people to verified local professionals and protect both sides with clear rules, platform payments, and accountability.
            </p>
          </div>

          <div className="p-6 bg-card rounded-2xl border border-border/50">
            <h2 className="text-xl font-semibold mb-3">Vision</h2>
            <p className="text-muted-foreground">
              A trusted marketplace where quality work is rewarded and customers get peace of mind — every time.
            </p>
          </div>

          <div className="p-6 bg-card rounded-2xl border border-border/50">
            <h2 className="text-xl font-semibold mb-3">How the platform works</h2>
            <ol className="space-y-2 text-muted-foreground">
              <li className="flex gap-2"><span className="font-bold text-primary">1.</span> Customer creates a job request with location and details.</li>
              <li className="flex gap-2"><span className="font-bold text-primary">2.</span> Verified Fundis nearby receive the job and can accept based on availability.</li>
              <li className="flex gap-2"><span className="font-bold text-primary">3.</span> Work is completed and confirmed by the customer (including OTP where applicable).</li>
              <li className="flex gap-2"><span className="font-bold text-primary">4.</span> Payments are handled through M-Pesa to prevent fraud and protect both sides.</li>
              <li className="flex gap-2"><span className="font-bold text-primary">5.</span> Ratings and reviews help maintain quality and trust.</li>
            </ol>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <Link to="/how-it-works"><Button variant="outline">How It Works</Button></Link>
          <Link to="/trust-safety"><Button variant="outline">Trust & Safety</Button></Link>
          <Link to="/contact"><Button variant="outline">Contact Us</Button></Link>
        </div>
      </div>
    </SiteLayout>
  );
}
