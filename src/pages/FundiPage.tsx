import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Gauge, Wallet } from "lucide-react";

const features = [
  { icon: BadgeCheck, title: "Verified onboarding", text: "Build trust with profile verification, credentials, and service history." },
  { icon: BriefcaseBusiness, title: "Incoming jobs", text: "See nearby requests and accept only the work that matches your skills and schedule." },
  { icon: Gauge, title: "Performance metrics", text: "Track response time, customer reviews, completion rates, and job quality." },
  { icon: Wallet, title: "Earnings visibility", text: "Monitor pending earnings, available payouts, and settlement history without exposing unrelated platform data." },
];

export default function FundiPage() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-14 md:py-20 max-w-6xl">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center mb-16">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-primary font-semibold mb-4">For fundis</p>
            <h1 className="text-4xl md:text-6xl font-display font-bold mb-5">Grow your work with a trusted platform.</h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              Join PataFundi to access ready-to-book customer work, manage your schedule, build your reputation, and get paid through a secure trusted system designed for real service professionals.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register/fundi"><Button className="bg-gradient-primary">Apply as a fundi</Button></Link>
              <Link to="/how-it-works"><Button variant="outline">View the process</Button></Link>
            </div>
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 shadow-lg">
            <div className="rounded-2xl bg-accent/10 p-4 mb-4">
              <p className="text-sm text-muted-foreground">Earnings this month</p>
              <p className="text-3xl font-bold">KES 64,800</p>
            </div>
            <div className="space-y-3">
              {[
                { label: "Jobs accepted", value: "27" },
                { label: "Completion rate", value: "96%" },
                { label: "Response time", value: "8 mins" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between border border-border rounded-2xl p-3">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-sm text-muted-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-3xl font-display font-bold mb-8">Built for real service professionals</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="p-6 bg-card border border-border rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-r from-accent/10 via-background to-primary/10 border border-border rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-primary font-semibold mb-2">Professional network</p>
            <h3 className="text-2xl md:text-3xl font-display font-bold">Work smarter with more visibility, better trust, and stronger earnings.</h3>
          </div>
          <Link to="/register/fundi">
            <Button className="bg-gradient-primary">
              Start your profile
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
}
