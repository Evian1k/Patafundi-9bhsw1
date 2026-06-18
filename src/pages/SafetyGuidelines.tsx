import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";

export default function SafetyGuidelines() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <h1 className="text-4xl font-display font-bold mb-4">Safety Guidelines</h1>
        <p className="text-muted-foreground text-lg mb-8">Simple steps to stay safe before, during, and after a job.</p>
        <div className="space-y-6">
          {[
            { title: "Before the job", items: ["Keep communication on-platform whenever possible.", "Never share passwords or one-time codes with anyone.", "Avoid off-platform payments — they remove protections."] },
            { title: "During the job", items: ["Meet in a well-lit area when possible and keep someone informed.", "Confirm the service details and expected cost before work begins.", "Report any suspicious behavior immediately."] },
            { title: "After the job", items: ["Confirm completion honestly (OTP where applicable).", "Leave a rating and review to help the community."] },
          ].map(({ title, items }) => (
            <div key={title} className="p-5 bg-card rounded-2xl border border-border/50">
              <h2 className="font-semibold text-lg mb-3">{title}</h2>
              <ul className="space-y-2">
                {items.map((item, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">•</span>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link to="/report-problem" className="text-primary hover:underline text-sm">Report a Problem →</Link>
        </div>
      </div>
    </SiteLayout>
  );
}
