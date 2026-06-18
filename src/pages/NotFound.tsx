import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-hero p-4">
      <div className="text-center">
        <h1 className="text-8xl font-display font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-semibold mb-2">Page not found</h2>
        <p className="text-muted-foreground mb-8">The page you're looking for doesn't exist.</p>
        <Link to="/" className="inline-flex items-center px-6 py-3 bg-gradient-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
