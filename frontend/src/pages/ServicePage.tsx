/**
 * /services/:slug — legacy deep-link shim (spec §15).
 *
 * Clicking a service anywhere in PataFundi goes STRAIGHT into the booking
 * flow; there is no informational landing page. This route exists only so
 * old links and bookmarks resolve: it forwards the visitor directly into
 * the booking wizard with the service preselected.
 */
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function ServicePage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/create-job?service=${encodeURIComponent(slug)}`, { replace: true });
  }, [slug, navigate]);

  // Rendered for one frame at most while the redirect effect runs.
  return (
    <div className="min-h-screen flex items-center justify-center" aria-busy="true">
      <p className="text-sm text-muted-foreground">Opening the booking flow…</p>
    </div>
  );
}
