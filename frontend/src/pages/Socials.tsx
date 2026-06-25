import SiteLayout from "@/components/layout/SiteLayout";

export default function Socials() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <h1 className="text-4xl font-display font-bold mb-4">PataFundi Socials</h1>
        <p className="text-muted-foreground mb-4">Official social accounts will be published here once they're verified.</p>
        <p className="text-muted-foreground text-sm">For now, reach us via Support at <a href="mailto:patafundi6@gmail.com" className="text-primary hover:underline">patafundi6@gmail.com</a>.</p>
      </div>
    </SiteLayout>
  );
}
