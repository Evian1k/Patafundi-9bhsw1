/**
 * BackBar — consistent backward navigation for nested screens (spec §25/§26).
 *
 * Every screen must answer "how does the user get back?". This bar gives a
 * visible, keyboard-accessible back control that prefers the in-app parent
 * (via `to` or `fallback`) and falls back to browser history, which keeps
 * deep-linked users from being trapped.
 */
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface BackBarProps {
  /** Explicit in-app destination (breadcrumb style), e.g. "/dashboard". */
  to?: string;
  /** Screen label the bar is on (shown next to the arrow). */
  label?: string;
  /** Where the arrow claims to go when no explicit `to` is given. */
  fallback?: string;
  className?: string;
}

export default function BackBar({ to, label, fallback, className = "" }: BackBarProps) {
  const navigate = useNavigate();

  const content = (
    <>
      <span
        className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <ArrowLeft className="w-4 h-4" />
      </span>
      {label && <span className="text-sm font-medium truncate">{label}</span>}
    </>
  );

  const base =
    "inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px]";

  if (to) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Link to={to} className={base} aria-label={label ? `Back to ${label}` : "Go back"}>
          {content}
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (fallback) navigate(fallback);
          else if (window.history.length > 1) navigate(-1);
          else navigate("/dashboard");
        }}
        className={base}
        aria-label={label ? `Back to ${label}` : "Go back"}
      >
        {content}
      </button>
    </div>
  );
}
