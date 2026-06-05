import { Link } from "react-router-dom";
import { Facebook, Twitter, Instagram, Linkedin } from "lucide-react";
import { BrandLogo } from "@/assets/logo";

const Footer = () => {
  const companyName = "PataFundi";
  const supportEmail = "patafundi6@gmail.com";

  const footerLinks = {
    services: [
      { name: "Plumbing", href: "/services/plumbing" },
      { name: "Electrical", href: "/services/electrical" },
      { name: "AC & HVAC", href: "/services/hvac" },
      { name: "Cleaning", href: "/services/cleaning" },
      { name: "Carpentry", href: "/services/carpentry" },
    ],
    company: [
      { name: "About Us", href: "/about" },
      { name: "Careers", href: "/careers" },
      { name: "Blog", href: "/blog" },
      { name: "Press", href: "/press" },
      { name: "How It Works", href: "/how-it-works" },
      { name: "Trust & Safety", href: "/trust-safety" },
      { name: "Investor Relations", href: "/investors" },
      { name: "Contact Us", href: "/contact" },
    ],
    support: [
      { name: "Help Center", href: "/help" },
      { name: "Safety Guidelines", href: "/safety-guidelines" },
      { name: "Refund Policy", href: "/refund-policy" },
      { name: "Terms of Service", href: "/terms" },
      { name: "Privacy Policy", href: "/privacy" },
      { name: "Cookies Policy", href: "/cookies" },
      { name: "Contact Support", href: "/contact-support" },
      { name: "Report a Problem", href: "/report-problem" },
    ],
    rules: [
      { name: "Platform Rules", href: "/platform-rules" },
      { name: "Enforcement Policy", href: "/enforcement" },
    ],
    forPros: [
      { name: "Become a Fundi", href: "/fundi/register" },
      { name: "Fundi Resources", href: "/fundi/resources" },
      { name: "Fundi App", href: "/fundi/app" },
    ],
  };

  const socialLinks = [
    { icon: Instagram, href: "/socials", label: "Instagram" },
    { icon: Facebook, href: "/socials", label: "Facebook" },
    { icon: Twitter, href: "/socials", label: "Twitter" },
    { icon: Linkedin, href: "/socials", label: "LinkedIn" },
  ];

  return (
    <footer className="bg-foreground text-background/80 mt-16">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <BrandLogo
              size="sm"
              showWordmark
              wordmarkClassName="text-xl text-background"
              className="mb-4"
            />
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

          {/* Services */}
          <div>
            <h4 className="font-semibold text-background mb-3 text-sm">Services</h4>
            <ul className="space-y-2">
              {footerLinks.services.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-xs text-background/60 hover:text-background transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-background mb-3 text-sm">Company</h4>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-xs text-background/60 hover:text-background transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold text-background mb-3 text-sm">Support</h4>
            <ul className="space-y-2">
              {footerLinks.support.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-xs text-background/60 hover:text-background transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Rules & For Pros */}
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
