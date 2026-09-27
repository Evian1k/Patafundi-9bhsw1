import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import BackBar from "@/components/layout/BackBar";

/**
 * Safety Guidelines (spec section 15) - complete PataFundi-specific safety
 * guidance for customers and professionals: before a job, during the job,
 * payments, and emergency situations.
 */
export default function SafetyGuidelines() {
  const sections = [
    {
      title: "Before a job",
      items: [
        "Confirm the booking through PataFundi. Only bookings made and tracked on the platform carry escrow protection, verification and dispute support.",
        "Review the professional or company profile before accepting: verification badges, completed jobs, ratings and reviews.",
        "Confirm the service and the quoted price. If you receive a quote, read the price breakdown and the estimated duration before you accept it.",
        "Keep communication inside the platform where possible. In-app messages are associated with your booking and can be reviewed if a dispute is opened.",
        "Do not share unnecessary sensitive information - passwords, one-time codes, full financial details or identity documents are never needed for a booking.",
        "For high-risk work (electrical panels, gas, structural changes, roofing), confirm the professional holds the appropriate qualifications and licenses for that category.",
      ],
    },
    {
      title: "During the job",
      items: [
        "Do not allow unauthorized people to perform the job. The professional you booked - or the technician the company assigned - is who should carry out the work.",
        "Keep children and pets away from hazardous work areas while work is in progress.",
        "Do not interfere with electrical, gas, structural or mechanical work while it is being performed. Ask questions, but let the professional work.",
        "Report unsafe behavior. If the professional is working dangerously, behaves inappropriately or brings someone unannounced, report it through the platform immediately.",
        "Use platform support when a situation becomes unsafe. You can pause, cancel (where applicable) or open a dispute from your booking page.",
      ],
    },
    {
      title: "Payments",
      items: [
        "Use supported PataFundi payment methods. Payments made through the platform are held in escrow and only released after you confirm the work is done.",
        "Be cautious of requests to bypass platform payment. A professional who asks for direct cash, mobile money or bank transfer outside PataFundi removes your protection - and violates platform rules.",
        "Keep receipts and booking records. Your booking number (PF-YYYY-NNNNNN), quotes, messages and payment receipts are all available in your account if you ever need them.",
      ],
    },
    {
      title: "Emergency situations",
      items: [
        "If there is an immediate threat to life or safety, contact the appropriate local emergency service first, then notify PataFundi where appropriate.",
        "PataFundi is a services marketplace - it is not an emergency-response organization and cannot dispatch emergency services.",
        "For gas leaks, electrical fires, flooding or structural danger, stop the work and leave the area before contacting anyone.",
      ],
    },
  ];

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <BackBar to="/" fallback="/" label="Home" className="mb-4" />
        <h1 className="text-4xl font-display font-bold mb-4">Safety Guidelines</h1>
        <p className="text-muted-foreground text-lg mb-8">
          How to stay safe on every job - before, during, and after the work, and what to do in an emergency.
        </p>
        <div className="space-y-6">
          {sections.map(({ title, items }) => (
            <div key={title} className="p-5 bg-card rounded-2xl border border-border/50">
              <h2 className="font-semibold text-lg mb-3">{title}</h2>
              <ul className="space-y-2">
                {items.map((item, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">•</span>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link to="/report-problem" className="text-primary hover:underline text-sm">Report a Problem</Link>
          <Link to="/support" className="text-primary hover:underline text-sm">Contact Support</Link>
          <Link to="/policy/platform-rules" className="text-primary hover:underline text-sm">Platform Rules</Link>
        </div>
      </div>
    </SiteLayout>
  );
}
