/**
 * FullScreenFallback — premium production fallback when a page can't load.
 * Never shows technical/debug messages.
 */
import { motion } from 'framer-motion';
import { RefreshCw, WifiOff, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  title?: string;
  message?: string;
  onRetry?: () => void;
  showHome?: boolean;
}

export default function FullScreenFallback({
  title = 'Service Temporarily Unavailable',
  message = 'We\'re having trouble loading this page. Please check your connection and try again.',
  onRetry,
  showHome = true,
}: Props) {
  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-sm w-full text-center"
      >
        {/* Icon */}
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mx-auto mb-6">
          <WifiOff className="w-9 h-9 text-muted-foreground" />
        </div>

        <h2 className="text-xl font-display font-bold mb-3">{title}</h2>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">{message}</p>

        <div className="flex flex-col gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center justify-center gap-2 w-full h-12 bg-primary text-white rounded-2xl font-medium text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}
          {showHome && (
            <Link
              to="/"
              className="flex items-center justify-center gap-2 w-full h-12 border border-border rounded-2xl font-medium text-sm hover:bg-muted transition-all"
            >
              <Home className="w-4 h-4" />
              Back to Home
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}
