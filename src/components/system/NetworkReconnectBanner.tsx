/**
 * NetworkReconnectBanner — appears at top of page during connection loss.
 * Automatically detects navigator.onLine and reconnect events.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';

export default function NetworkReconnectBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const handleOffline = () => { setOffline(true); setJustReconnected(false); };
    const handleOnline = () => {
      setOffline(false);
      setJustReconnected(true);
      setTimeout(() => setJustReconnected(false), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {(offline || justReconnected) && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2.5 text-sm font-medium ${
            offline
              ? 'bg-gray-900 text-white'
              : 'bg-green-600 text-white'
          }`}
          role="status"
          aria-live="polite"
        >
          {offline ? (
            <>
              <WifiOff className="w-4 h-4" />
              No internet connection — some features may be unavailable
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4" />
              Back online!
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
