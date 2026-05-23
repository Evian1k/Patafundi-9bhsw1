import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function FundiApp() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
        <h1 className="text-4xl font-display font-bold mb-4">Fundi App</h1>
        <p className="text-muted-foreground mb-4">The Fundi dashboard is available inside the PataFundi web app.</p>
        <p className="text-muted-foreground text-sm mb-6">If you're a verified Fundi, sign in and visit your Fundi dashboard. If you are not yet verified, start here:</p>
        <Link to="/fundi/register"><Button className="bg-gradient-primary">Become a Fundi</Button></Link>
      </div>
    </SiteLayout>
  );
}
