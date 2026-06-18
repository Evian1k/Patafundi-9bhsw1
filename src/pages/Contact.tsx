import SiteLayout from "@/components/layout/SiteLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function Contact() {
  const supportEmail = "patafundi6@gmail.com";
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <h1 className="text-4xl font-display font-bold mb-4">Contact Us</h1>
        <p className="text-muted-foreground text-lg mb-8">We're here to help customers and Fundis.</p>
        <div className="space-y-6">
          <div className="p-6 bg-card rounded-2xl border border-border/50">
            <h2 className="font-semibold text-lg mb-2">Support</h2>
            <p className="text-muted-foreground text-sm mb-3">Email: <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">{supportEmail}</a></p>
            <div className="flex gap-3">
              <Link to="/contact-support"><Button size="sm">Contact Support</Button></Link>
              <Link to="/report-problem"><Button size="sm" variant="outline">Report a Problem</Button></Link>
            </div>
          </div>
          <div className="p-6 bg-card rounded-2xl border border-border/50">
            <h2 className="font-semibold text-lg mb-2">Business</h2>
            <p className="text-muted-foreground text-sm">For partnerships and integrations, reach out via Support and select the "Other" category.</p>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
