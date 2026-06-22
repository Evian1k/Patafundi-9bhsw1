/**
 * MaintenancePage — shown to customers and fundis when the platform
 * is in maintenance mode. Staff (admin, super_admin, etc.) bypass
 * maintenance mode and never see this page.
 *
 * This page includes a "Staff Login" button so that admin/super_admin
 * can still log in during maintenance to maintain the system.
 */
import { motion } from "framer-motion";
import { Wrench, Clock, Shield, UserCog } from "lucide-react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <BrandLogo className="h-12" />
          </div>

          {/* Maintenance icon */}
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            className="w-20 h-20 mx-auto mb-6 bg-amber-100 rounded-full flex items-center justify-center"
          >
            <Wrench className="w-10 h-10 text-amber-600" />
          </motion.div>

          <h1 className="text-2xl font-bold text-slate-900 mb-3">
            We'll be right back
          </h1>
          <p className="text-slate-600 text-sm leading-relaxed mb-6">
            PataFundi is undergoing scheduled maintenance to bring you a better experience.
            We apologize for the inconvenience and appreciate your patience.
          </p>

          {/* Info cards */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl text-left">
              <Clock className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-900">We're working on it</p>
                <p className="text-xs text-slate-500">Maintenance typically takes 15–30 minutes</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl text-left">
              <Shield className="w-5 h-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-900">Your data is safe</p>
                <p className="text-xs text-slate-500">All your jobs, payments, and messages are secure</p>
              </div>
            </div>
          </div>

          {/* Retry button */}
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-gradient-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>

          {/* Staff login link — allows admin/super_admin to log in during maintenance */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link
              to="/staff/login"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary transition-colors"
            >
              <UserCog className="w-3.5 h-3.5" />
              Staff Login
            </Link>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            If this persists, follow us on social media for updates.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
