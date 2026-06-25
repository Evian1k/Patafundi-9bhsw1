import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function HowItWorks() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-4">How It Works</h1>
        <p className="text-muted-foreground text-lg mb-8">A simple flow designed for speed, safety, and accountability.</p>
        <div className="space-y-6">
          {[
            { num: 1, title: "Request a service", desc: "Describe the issue, choose a category, and add your location. The more detail you provide, the faster matching becomes." },
            { num: 2, title: "Match with verified Fundis", desc: "Fundis go through identity verification and platform checks. You can review their profile signals (experience, location, ratings)." },
            { num: 3, title: "Complete the job safely", desc: "Communicate through the platform, avoid off-platform payments, and confirm completion honestly." },
            { num: 4, title: "Rate and review", desc: "Ratings and reviews impact visibility and trust. Repeated abuse leads to enforcement actions." },
          ].map(({ num, title, desc }) => (
            <div key={num} className="flex gap-4 p-5 bg-card rounded-2xl border border-border/50">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary">{num}</div>
              <div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-8">
          <Link to="/create-job"><Button className="bg-gradient-primary">Create a Job</Button></Link>
          <Link to="/platform-rules"><Button variant="outline">Platform Rules</Button></Link>
        </div>
      </div>
    </SiteLayout>
  );
}
