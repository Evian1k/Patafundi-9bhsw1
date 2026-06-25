/**
 * Cookie Consent Banner — GDPR compliance
 * Shows on first visit, stores consent in localStorage
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Cookie, X } from "lucide-react";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (!consent) setVisible(true);
  }, []);

  const accept = (level: "all" | "essential") => {
    localStorage.setItem("cookie_consent", level);
    localStorage.setItem("cookie_consent_date", new Date().toISOString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 text-white p-4 shadow-lg">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4">
        <Cookie className="w-6 h-6 text-amber-400 shrink-0" />
        <p className="text-sm flex-1 text-center sm:text-left">
          We use cookies for authentication and security. By using PataFundi, you agree to our{" "}
          <Link to="/cookies" className="text-amber-400 hover:underline">Cookies Policy</Link> and{" "}
          <Link to="/privacy" className="text-amber-400 hover:underline">Privacy Policy</Link>.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => accept("essential")}
            className="px-3 py-1.5 text-xs border border-white/30 rounded-lg hover:bg-white/10"
          >
            Essential Only
          </button>
          <button
            onClick={() => accept("all")}
            className="px-3 py-1.5 text-xs bg-primary rounded-lg hover:bg-primary/90"
          >
            Accept All
          </button>
          <button onClick={() => accept("all")} className="p-1.5 text-white/50 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
