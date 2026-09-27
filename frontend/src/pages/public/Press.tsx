import SiteLayout from "@/components/layout/SiteLayout";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Press page (spec §44): real media contacts and a factual company profile.
 * Honest by design - the newsroom list states plainly that there are no
 * announcements yet instead of showing fake press releases.
 */
export default function Press() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-4">Press</h1>
        <p className="text-muted-foreground text-lg mb-10">
          Press and media resources for PataFundi, the platform connecting customers with verified local professionals.
        </p>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-3">Company facts</h2>
              <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="font-medium text-foreground">Founded</dt>
                  <dd className="text-muted-foreground">PataFundi launched in Nairobi, Kenya.</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">What we do</dt>
                  <dd className="text-muted-foreground">
                    A two-sided marketplace where customers book verified Fundis (independent professionals) and service companies for home and business jobs.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">How payments work</dt>
                  <dd className="text-muted-foreground">
                    Customers pay through M-Pesa (card payments rolling out). Funds are held in escrow until the customer confirms the work is done.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Where we operate</dt>
                  <dd className="text-muted-foreground">Kenya first, built to expand across African markets.</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-3">Newsroom</h2>
              <p className="text-muted-foreground mb-4">
                There are no press announcements published yet. When we have news - launches, partnerships, or company milestones - they will appear here.
              </p>
              <p className="text-sm text-muted-foreground">
                In the meantime, our <span className="font-medium text-foreground">About</span> page covers the mission and how the platform works.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-3">Media contact</h2>
              <p className="text-muted-foreground">
                Journalists and media houses can reach us at{" "}
                <a href="mailto:press@patafundi.com" className="text-primary font-medium hover:underline">press@patafundi.com</a>.
                We aim to respond within one business day.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </SiteLayout>
  );
}
