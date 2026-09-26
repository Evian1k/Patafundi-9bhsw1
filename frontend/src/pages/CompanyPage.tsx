import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2, MapPinned, ShieldCheck, BarChart3, Users, Workflow } from "lucide-react";

const pillars = [
  { icon: Workflow, title: "Assignment workflow", text: "Route jobs to the right branch, technician, or capability with clear status tracking." },
  { icon: MapPinned, title: "Service coverage", text: "Manage service areas, technician availability, and active job allocation across branches." },
  { icon: Users, title: "Technician management", text: "Add, assign, review, and suspend technicians while remaining inside your tenant boundary." },
  { icon: BarChart3, title: "Business insight", text: "See your jobs, revenue, settlements, repeat customers, and branch performance without platform-wide noise." },
  { icon: ShieldCheck, title: "Trust & compliance", text: "Keep verification, documents, and customer trust flows aligned to your business standards." },
  { icon: Building2, title: "Company growth", text: "Scale your service business with recurring work, repeat work, and professional partner-level tools." },
];

export default function CompanyPage() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-14 md:py-20 max-w-6xl">
        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-10 items-center mb-16">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-primary font-semibold mb-4">Company partner portal</p>
            <h1 className="text-4xl md:text-6xl font-display font-bold mb-5">Deliver real service growth for your business.</h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              FundiHub helps verified service companies receive job demand, control field teams, monitor performance, and keep customers happy without operating a fragmented service stack.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/partner-program"><Button className="bg-gradient-primary">Partner with FundiHub</Button></Link>
              <Link to="/contact"><Button variant="outline">Talk to sales</Button></Link>
            </div>
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 shadow-lg">
            <div className="grid gap-4">
              <div className="rounded-2xl bg-primary/10 p-4">
                <p className="text-sm text-muted-foreground">Active jobs</p>
                <p className="text-3xl font-bold">184</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-secondary p-4">
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold">1,509</p>
                </div>
                <div className="rounded-2xl bg-secondary p-4">
                  <p className="text-sm text-muted-foreground">Avg. rating</p>
                  <p className="text-2xl font-bold">4.9</p>
                </div>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Service mix</span>
                  <span className="text-sm font-medium">Plumbing 38%</span>
                </div>
                <div className="mt-3 h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full w-[38%] bg-primary rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-3xl font-display font-bold mb-8">Why companies choose FundiHub</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {pillars.map((pillar) => (
              <div key={pillar.title} className="p-6 bg-card border border-border rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <pillar.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{pillar.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{pillar.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-r from-primary/10 via-background to-accent/10 border border-border rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-primary font-semibold mb-2">Ready to grow</p>
            <h3 className="text-2xl md:text-3xl font-display font-bold">Turn service demand into predictable business operations.</h3>
          </div>
          <Link to="/partner-program">
            <Button className="bg-gradient-primary">
              Get started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
}
