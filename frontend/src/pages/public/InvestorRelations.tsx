import SiteLayout from "@/components/layout/SiteLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";

/**
 * Investor Relations (spec §44): honest, factual investor information.
 * PataFundi is privately held; we publish what is true today and state
 * plainly what is not yet available rather than fabricating figures.
 */
export default function InvestorRelations() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-4">Investor Relations</h1>
        <p className="text-muted-foreground text-lg mb-10">
          Information for investors and partners interested in PataFundi.
        </p>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-3">About the company</h2>
              <p className="text-muted-foreground mb-3">
                PataFundi operates a services marketplace that connects customers with verified Fundis (independent professionals) and vetted service companies. Revenue comes from platform commissions on completed jobs and optional subscription plans for professionals and companies.
              </p>
              <p className="text-muted-foreground">
                The platform is built Africa-first: M-Pesa payments, escrow-protected transactions, low-bandwidth-friendly apps, and a verification system designed around local realities.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-3">Business model</h2>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex gap-2"><span className="font-bold text-primary">1.</span> Commission on completed jobs - set per category by platform configuration, never a single hardcoded percentage.</li>
                <li className="flex gap-2"><span className="font-bold text-primary">2.</span> Fundi Pro subscriptions - paid visibility and eligibility benefits for independent professionals.</li>
                <li className="flex gap-2"><span className="font-bold text-primary">3.</span> Company Growth subscriptions - listing priority and team tooling for service companies.</li>
                <li className="flex gap-2"><span className="font-bold text-primary">4.</span> Enterprise maintenance contracts for recurring commercial work.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-3">Disclosures</h2>
              <p className="text-muted-foreground">
                PataFundi is currently privately held and has not announced a funding round, so no financial reports, cap-table data, or shareholder communications are published here yet. When that changes, this page will carry official filings and announcements - always first, always verified.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-3">Contact</h2>
              <p className="text-muted-foreground mb-2">
                Investor and partnership enquiries:{" "}
                <a href="mailto:investors@patafundi.com" className="text-primary font-medium hover:underline">investors@patafundi.com</a>
              </p>
              <p className="text-sm text-muted-foreground">
                For press matters, see the <Link to="/press" className="text-primary hover:underline">Press page</Link>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </SiteLayout>
  );
}
