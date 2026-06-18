import SiteLayout from "@/components/layout/SiteLayout";

export default function Investors() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <h1 className="text-4xl font-display font-bold mb-4">Investor Relations</h1>
        <p className="text-muted-foreground text-lg mb-4">We'll publish investor updates and milestones here as PataFundi grows.</p>
        <p className="text-muted-foreground text-sm">For investor inquiries, please contact the team via Support until the official investor mailbox is announced.</p>
      </div>
    </SiteLayout>
  );
}
