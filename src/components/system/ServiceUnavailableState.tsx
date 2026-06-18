/**
 * ServiceUnavailableState — elegant empty state for when a specific section fails to load.
 * No technical jargon, no env variable names.
 */
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

interface Props {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export default function ServiceUnavailableState({
  icon,
  title = 'Content Unavailable',
  description = 'This section is temporarily unavailable. Please try again in a moment.',
  onRetry,
  compact = false,
}: Props) {
  const padding = compact ? 'py-8' : 'py-16';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center ${padding} text-center px-4`}
    >
      {icon ? (
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4 text-muted-foreground">
          {icon}
        </div>
      ) : (
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <RefreshCw className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
      <p className="font-semibold text-foreground mb-2">{title}</p>
      <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      )}
    </motion.div>
  );
}
