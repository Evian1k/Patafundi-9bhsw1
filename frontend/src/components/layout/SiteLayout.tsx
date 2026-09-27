import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { SkipToContent } from "@/lib/a11y";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <SkipToContent />
      <Header />
      <main id="main-content" className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
