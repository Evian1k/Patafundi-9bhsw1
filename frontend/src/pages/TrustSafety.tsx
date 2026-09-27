import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, MapPin, CreditCard, AlertTriangle } from "lucide-react";

export default function TrustSafety() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-4">Trust & Safety</h1>
        <p className="text-muted-foreground text-lg mb-8">Trust is the product. We design PataFundi to reduce fraud and keep users safe.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            { icon: Shield, title: "Verification", desc: "Fundis submit identity documents and verification evidence. Suspicious submissions can be flagged for review." },
            { icon: MapPin, title: "Location & job signals", desc: "GPS and job history help match customers to nearby, reliable professionals and detect anomalies." },
            { icon: CreditCard, title: "Payment protection", desc: "Platform payments are required. Off-platform payments increase risk and can lead to suspension." },
            { icon: AlertTriangle, title: "Enforcement", desc: "We use a warning → restriction → suspension → ban model based on severity and recurrence." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-5 bg-card rounded-2xl border border-border/50">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3"><Icon className="w-5 h-5 text-primary" /></div>
              <h3 className="font-semibold mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-8">
          <Link to="/report-problem"><Button className="bg-gradient-primary">Report a Problem</Button></Link>
          <Link to="/platform-rules"><Button variant="outline">Platform Rules</Button></Link>
          <Link to="/enforcement"><Button variant="outline">Enforcement Policy</Button></Link>
        </div>
      </div>
    </SiteLayout>
  );
}
