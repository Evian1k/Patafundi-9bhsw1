import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";

export default function FundiResources() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <h1 className="text-4xl font-display font-bold mb-4">Fundi Resources</h1>
        <p className="text-muted-foreground mb-8">Guidance for verified professionals using PataFundi.</p>
        <div className="space-y-5">
          <div className="p-5 bg-card rounded-2xl border border-border/50">
            <h2 className="font-semibold mb-2">Verification tips</h2>
            <p className="text-sm text-muted-foreground">Use clear photos, match your ID details, and keep your profile location accurate.</p>
          </div>
          <div className="p-5 bg-card rounded-2xl border border-border/50">
            <h2 className="font-semibold mb-2">Do's and don'ts</h2>
            <p className="text-sm text-muted-foreground">Avoid off-platform payments and keep communication professional. Repeated cancellations can reduce visibility.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Read the <Link to="/platform-rules" className="text-primary hover:underline">Platform Rules</Link> and <Link to="/enforcement" className="text-primary hover:underline">Enforcement Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
