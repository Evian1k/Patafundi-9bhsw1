import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, BadgeCheck, Clock3, MapPinned, ShieldCheck, MessageSquareText, WalletCards } from "lucide-react";

const features = [
  { icon: MapPinned, title: "Find trusted professionals nearby", text: "Search by service, location, rating, and verification status." },
  { icon: ShieldCheck, title: "Secure service flow", text: "Payments, trust signals, and review history are built around protection and accountability." },
  { icon: Clock3, title: "Live status tracking", text: "Track provider arrival, job progress, and completion milestones in real time." },
  { icon: MessageSquareText, title: "Clear communication", text: "Stay in touch with your assigned provider through a protected job chat." },
  { icon: WalletCards, title: "Protected payments", text: "Secure payments and receipts from request to completion keep both sides protected." },
  { icon: BadgeCheck, title: "Verified service record", text: "Keep a reliable digital history of jobs, receipts, reviews, and service documents." },
];

export default function CustomerPage() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-14 md:py-20 max-w-6xl">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center mb-16">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-primary font-semibold mb-4">For customers</p>
            <h1 className="text-4xl md:text-6xl font-display font-bold mb-5">Find trusted help for real work.</h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              Whether you need plumbing, electrical work, home repair, cleaning, or an urgent job, PataFundi connects you with verified professionals and trusted service businesses without the guesswork.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/create-job"><Button className="bg-gradient-primary">Request a service</Button></Link>
              <Link to="/how-it-works"><Button variant="outline">See how it works</Button></Link>
            </div>
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 shadow-lg">
            <div className="rounded-2xl bg-primary/10 p-4 mb-4">
              <p className="text-sm text-muted-foreground">Current demand</p>
              <p className="text-3xl font-bold">2.4k</p>
              <p className="text-sm text-primary">jobs in your area</p>
            </div>
            <div className="space-y-3">
              {[
                { label: "Plumber", value: "Available now" },
                { label: "Electrical", value: "6 min away" },
                { label: "Cleaning", value: "Top rated" },
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
          <h2 className="text-3xl font-display font-bold mb-8">Why customers choose PataFundi</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="p-6 bg-card border border-border rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-r from-primary/10 via-background to-accent/10 border border-border rounded-3xl p-8 md:p-12">
          <p className="text-sm uppercase tracking-[0.2em] text-primary font-semibold mb-2">Simple flow</p>
          <h3 className="text-2xl md:text-3xl font-display font-bold mb-5">Request. Compare. Book. Track. Confirm. Pay securely.</h3>
          <div className="flex flex-wrap gap-3">
            <Link to="/create-job"><Button className="bg-gradient-primary">Create your job</Button></Link>
            <Link to="/trust-safety"><Button variant="outline">Trust & safety</Button></Link>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
