import { Link } from "react-router-dom";
import { Facebook, Twitter, Instagram, Linkedin } from "lucide-react";
import { BrandLogo } from "@/assets/logo";

/**
 * Footer (spec §50) — concise, professional, and HONEST: every link resolves
 * to a page that actually exists with real content. Blog and Careers are
 * database-backed (spec §46-47) and shown whenever they exist. Service links
 * go straight into the booking flow (spec §15).
 */
const Footer = () => {
  const companyName = "PataFundi";
  const supportEmail = "support@patafundi.com";

  const footerLinks = {
    platform: [
      { name: "How It Works", href: "/how-it-works" },
      { name: "Browse Services", href: "/dashboard" },
      { name: "Service Companies", href: "/companies" },
      { name: "Trust & Safety", href: "/trust-safety" },
      { name: "Partner Program", href: "/partner-program" },
      { name: "Blog", href: "/blog" },
    ],
    support: [
      { name: "Help Center", href: "/help" },
      { name: "Safety Guidelines", href: "/safety-guidelines" },
      { name: "Contact Support", href: "/contact-support" },
      { name: "Report a Problem", href: "/report-problem" },
    ],
    legal: [
      { name: "Terms of Service", href: "/terms" },
      { name: "Privacy Policy", href: "/privacy" },
      { name: "Cookie Policy", href: "/cookies" },
      { name: "Refund Policy", href: "/refund-policy" },
    ],
    rules: [
      { name: "Platform Rules", href: "/platform-rules" },
      { name: "Enforcement Policy", href: "/enforcement" },
    ],
    forPros: [
      { name: "Become a Fundi", href: "/register/fundi" },
      { name: "Fundi App", href: "/fundi/app" },
      { name: "Fundi Resources", href: "/fundi/resources" },
      { name: "Careers", href: "/careers" },
    ],
  };

  const socialLinks = [
    { icon: Instagram, href: "/socials", label: "Instagram" },
    { icon: Facebook, href: "/socials", label: "Facebook" },
    { icon: Twitter, href: "/socials", label: "Twitter" },
    { icon: Linkedin, href: "/socials", label: "LinkedIn" },
  ];

  const columns: { title: string; links: { name: string; href: string }[] }[] = [
    { title: "Platform", links: footerLinks.platform },
    { title: "Support", links: footerLinks.support },
    { title: "Legal", links: footerLinks.legal },
  ];

  return (
    <footer className="bg-foreground text-background/80 mt-16">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <BrandLogo size="md" className="mb-4" />
            <p className="text-sm text-background/60 mb-4 leading-relaxed">
              Connecting you with verified local professionals for all your home and business needs.
            </p>
            <p className="text-xs text-background/50 mb-4">Support: {supportEmail}</p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <Link
                  key={social.label}
                  to={social.href}
                  aria-label={social.label}
                  className="w-8 h-8 rounded-full bg-background/10 flex items-center justify-center hover:bg-background/20 transition-colors"
                >
                  <social.icon className="w-4 h-4" />
                </Link>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-semibold text-background mb-3 text-sm">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="text-xs text-background/60 hover:text-background transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Rules & For Professionals */}
          <div className="space-y-6">
            <div>
              <h4 className="font-semibold text-background mb-3 text-sm">Rules & Policies</h4>
              <ul className="space-y-2">
                {footerLinks.rules.map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="text-xs text-background/60 hover:text-background transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-background mb-3 text-sm">For Professionals</h4>
              <ul className="space-y-2">
                {footerLinks.forPros.map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="text-xs text-background/60 hover:text-background transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-background/10 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-background/40">
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
          <div className="flex gap-4">
            <Link to="/terms" className="text-xs text-background/40 hover:text-background/70 transition-colors">Terms</Link>
            <Link to="/privacy" className="text-xs text-background/40 hover:text-background/70 transition-colors">Privacy</Link>
            <Link to="/cookies" className="text-xs text-background/40 hover:text-background/70 transition-colors">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
