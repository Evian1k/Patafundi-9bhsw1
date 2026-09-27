/**
 * Demo Accounts Page — /demo
 *
 * Shows every demo account with copy-to-clipboard buttons and one-click
 * login (dev only). Hidden in production by default — guarded by a
 * VITE_DEV_DEMO flag and NODE_ENV check.
 *
 * Core accounts (seeded automatically at dev boot by ensure-dev-db.js):
 *   demo@patafundi.com / Demo@2024!         → customer
 *   fundi@patafundi.com / Fundi@2024!       → fundi (approved)
 *   admin@patafundi.com / Admin@2024!       → super_admin
 *   ops@patafundi.com / Ops@2024!           → admin (ops manager)
 *   support@patafundi.com / Support@2024!   → support_agent
 *   fraud@patafundi.com / Fraud@2024!       → fraud_analyst
 *   finance@patafundi.com / Finance@2024!   → finance_team
 *   dispatch@patafundi.com / Dispatch@2024! → dispatch_team
 *   devops@patafundi.com / Devops@2024!     → devops_engineer
 *   auditor@patafundi.com / Auditor@2024!   → auditor
 *
 * Takeover ecosystem (seeded automatically at dev boot by seed-takeover.js
 * — see DEMO_ACCOUNTS.md):
 *   customer.demo@patafundi.test            → customer
 *   fundi.demo@patafundi.test               → fundi (John Kamau)
 *   company.demo@patafundi.test             → company_admin (Apex owner)
 *   dispatcher.demo@patafundi.test          → company dispatcher
 *   technician.demo@patafundi.test          → company technician
 *   admin.demo@patafundi.test               → super_admin
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Copy, Check, LogIn, Users, Wrench, Shield, Headphones,
  AlertTriangle, DollarSign, Package, Activity, ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { resolvePostLoginPath } from "@/lib/postLoginRoute";

interface DemoAccount {
  email: string;
  password: string;
  role: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "demo@patafundi.com",
    password: "Demo@2024!",
    role: "customer",
    label: "Customer",
    description: "Create jobs, hire fundis, pay, review",
    icon: Users,
    color: "#2595FF",
  },
  {
    email: "fundi@patafundi.com",
    password: "Fundi@2024!",
    role: "fundi",
    label: "Fundi (Approved)",
    description: "Accept jobs, track location, earn money",
    icon: Wrench,
    color: "#10B981",
  },
  {
    email: "admin@patafundi.com",
    password: "Admin@2024!",
    role: "super_admin",
    label: "Super Admin",
    description: "Full access — manage everything",
    icon: Shield,
    color: "#1E293B",
  },
  {
    email: "ops@patafundi.com",
    password: "Ops@2024!",
    role: "admin",
    label: "Ops Manager",
    description: "Approve fundis, manage jobs (no role management)",
    icon: Shield,
    color: "#475569",
  },
  {
    email: "support@patafundi.com",
    password: "Support@2024!",
    role: "support_agent",
    label: "Support Agent",
    description: "View disputes, tickets, users",
    icon: Headphones,
    color: "#8B5CF6",
  },
  {
    email: "fraud@patafundi.com",
    password: "Fraud@2024!",
    role: "fraud_analyst",
    label: "Fraud Analyst",
    description: "Fraud dashboard, flag, suspend, ban",
    icon: AlertTriangle,
    color: "#EF4444",
  },
  {
    email: "finance@patafundi.com",
    password: "Finance@2024!",
    role: "finance_team",
    label: "Finance Team",
    description: "Payments, escrow, payouts, revenue",
    icon: DollarSign,
    color: "#059669",
  },
  {
    email: "dispatch@patafundi.com",
    password: "Dispatch@2024!",
    role: "dispatch_team",
    label: "Dispatch Team",
    description: "Assign jobs, approve fundis",
    icon: Package,
    color: "#D97706",
  },
  {
    email: "devops@patafundi.com",
    password: "Devops@2024!",
    role: "devops_engineer",
    label: "DevOps Engineer",
    description: "Logs, metrics, system health",
    icon: Activity,
    color: "#0891B2",
  },
  {
    email: "auditor@patafundi.com",
    password: "Auditor@2024!",
    role: "auditor",
    label: "Auditor (Read-Only)",
    description: "Read-only compliance view",
    icon: ScrollText,
    color: "#6B7280",
  },
  // ── Takeover demo ecosystem (@patafundi.test) — see DEMO_ACCOUNTS.md ──
  {
    email: "customer.demo@patafundi.test",
    password: "PataFundi#2026",
    role: "customer",
    label: "Customer (Takeover Demo)",
    description: "Book companies & fundis, properties, pay, review",
    icon: Users,
    color: "#2595FF",
  },
  {
    email: "fundi.demo@patafundi.test",
    password: "PataFundi#2026",
    role: "fundi",
    label: "Fundi — John Kamau (Takeover Demo)",
    description: "Verified individual fundi with wallet",
    icon: Wrench,
    color: "#10B981",
  },
  {
    email: "company.demo@patafundi.test",
    password: "PataFundi#2026",
    role: "company_admin",
    label: "Apex Home Services Owner (Takeover Demo)",
    description: "Full company portal: dispatch, team, finance",
    icon: Shield,
    color: "#059669",
  },
  {
    email: "dispatcher.demo@patafundi.test",
    password: "PataFundi#2026",
    role: "company",
    label: "Apex Dispatcher (Takeover Demo)",
    description: "Accept + assign jobs (no finance access)",
    icon: Package,
    color: "#D97706",
  },
  {
    email: "technician.demo@patafundi.test",
    password: "PataFundi#2026",
    role: "technician",
    label: "Apex Technician (Takeover Demo)",
    description: "Assigned jobs, status updates",
    icon: Wrench,
    color: "#0891B2",
  },
  {
    email: "admin.demo@patafundi.test",
    password: "PataFundi#2026",
    role: "super_admin",
    label: "Super Admin (Takeover Demo)",
    description: "Command center incl. company approvals",
    icon: Shield,
    color: "#1E293B",
  },
];

export default function DemoPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const copyCredentials = (account: DemoAccount) => {
    const text = `Email: ${account.email}\nPassword: ${account.password}`;
    copyToClipboard(text, `full-${account.email}`);
  };

  const quickLogin = async (account: DemoAccount) => {
    setLoggingIn(account.email);
    try {
      // Use apiClient.login() so the token is stored in localStorage
      // and the auth session is set. Without this, the dashboard pages
      // can't make authenticated API calls (they'd get 401/403).
      const data = await apiClient.login(account.email, account.password) as {
        success?: boolean;
        message?: string;
        user?: Record<string, unknown>;
        token?: string;
      };
      if (!data.success) {
        toast.error(data.message || "Login failed");
        return;
      }
      toast.success(`Logged in as ${account.label}`);

      // Same role-aware routing as the manual login page — every account
      // lands in its own world (admin console, fundi app, company portal,
      // technician app or customer dashboard).
      const path = await resolvePostLoginPath(data.user ?? null);
      navigate(path);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Login failed — is the backend running?");
    } finally {
      setLoggingIn(null);
    }
  };

  const containerVariants = reduceMotion ? {} : stagger;
  const itemVariants = reduceMotion ? {} : fadeUp;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div initial="hidden" animate="visible" variants={containerVariants}>
          <motion.div variants={itemVariants} className="text-center mb-10">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Demo Accounts</h1>
            <p className="text-slate-600">
              PataFundi has {DEMO_ACCOUNTS.length} demo accounts covering every role — customers, fundis, the
              company portal (owner, dispatcher, technician) and all staff consoles. Click any card to log in instantly,
              or copy the credentials to use on the login page.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              <AlertTriangle className="w-3 h-3" />
              Dev only — these accounts are seeded by the dev database. Do not use in production.
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEMO_ACCOUNTS.map((account) => {
              const Icon = account.icon;
              const isLoggingIn = loggingIn === account.email;
              return (
                <motion.div
                  key={account.email}
                  variants={itemVariants}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${account.color}15` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: account.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900">{account.label}</h3>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${account.color}15`, color: account.color }}
                        >
                          {account.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-3">{account.description}</p>

                      <div className="space-y-1.5 mb-3">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-slate-400 w-16 text-xs">Email</span>
                          <code className="flex-1 text-slate-700 bg-slate-50 px-2 py-1 rounded text-xs truncate">
                            {account.email}
                          </code>
                          <button
                            onClick={() => copyToClipboard(account.email, `email-${account.email}`)}
                            className="p-1 text-slate-400 hover:text-slate-700"
                            title="Copy email"
                          >
                            {copied === `email-${account.email}` ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-slate-400 w-16 text-xs">Password</span>
                          <code className="flex-1 text-slate-700 bg-slate-50 px-2 py-1 rounded text-xs truncate">
                            {account.password}
                          </code>
                          <button
                            onClick={() => copyToClipboard(account.password, `pwd-${account.email}`)}
                            className="p-1 text-slate-400 hover:text-slate-700"
                            title="Copy password"
                          >
                            {copied === `pwd-${account.email}` ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => quickLogin(account)}
                          disabled={isLoggingIn}
                          className="flex-1"
                          style={{ backgroundColor: account.color }}
                        >
                          {isLoggingIn ? (
                            <span className="flex items-center gap-2">
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Logging in…
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <LogIn className="w-3.5 h-3.5" />
                              Quick Login
                            </span>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyCredentials(account)}
                          className="flex items-center gap-2"
                        >
                          {copied === `full-${account.email}` ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          Copy All
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          <motion.div variants={itemVariants} className="mt-8 text-center">
            <Button variant="ghost" onClick={() => navigate("/auth")}>
              ← Back to login
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
