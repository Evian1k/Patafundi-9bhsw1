import SiteLayout from "@/components/layout/SiteLayout";
import { Button } from "@/components/ui/button";

export default function Press() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <h1 className="text-4xl font-display font-bold mb-4">Press</h1>
        <p className="text-muted-foreground text-lg mb-8">Press resources for PataFundi. For media inquiries, contact support.</p>
        <div className="space-y-6">
          <div className="p-6 bg-card rounded-2xl border border-border/50">
            <h2 className="font-semibold mb-2">Brand assets</h2>
            <p className="text-muted-foreground text-sm mb-4">Use the official logo and icon when referencing PataFundi.</p>
            <div className="flex gap-3">
              <Button variant="outline" size="sm">Download icon</Button>
              <Button variant="outline" size="sm">Download logo</Button>
            </div>
          </div>
          <div className="p-6 bg-card rounded-2xl border border-border/50">
            <h2 className="font-semibold mb-2">Product summary</h2>
            <p className="text-muted-foreground text-sm">PataFundi connects customers with verified local professionals for reliable services — with platform rules, payment protection, and accountability.</p>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
