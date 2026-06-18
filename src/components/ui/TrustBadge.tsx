/**
 * TrustBadge — dynamic trust level badge based on user trust score.
 * Levels: Elite (>=90), Trusted (>=70), Verified (>=50), Risky (<50) or Unrated (null).
 */

import { ShieldCheck, Star, Award, AlertTriangle, Shield } from "lucide-react";

export type TrustLevel = "elite" | "trusted" | "verified" | "risky" | "unrated";

interface TrustBadgeProps {
  score?: number | null;
  /** Override the computed level */
  level?: TrustLevel;
  size?: "sm" | "md" | "lg";
  showScore?: boolean;
  className?: string;
}

export function getTrustLevel(score?: number | null): TrustLevel {
  if (score == null) return "unrated";
  if (score >= 90) return "elite";
  if (score >= 70) return "trusted";
  if (score >= 50) return "verified";
  return "risky";
}

const LEVEL_CONFIG: Record<
  TrustLevel,
  { label: string; bg: string; text: string; border: string; icon: React.ElementType }
> = {
  elite: {
    label: "Elite",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-300",
    icon: Award,
  },
  trusted: {
    label: "Trusted",
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-300",
    icon: ShieldCheck,
  },
  verified: {
    label: "Verified",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-300",
    icon: Shield,
  },
  risky: {
    label: "Risky",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-300",
    icon: AlertTriangle,
  },
  unrated: {
    label: "Unrated",
    bg: "bg-gray-50",
    text: "text-gray-500",
    border: "border-gray-200",
    icon: Star,
  },
};

const SIZE_CLASSES = {
  sm: { wrapper: "px-2 py-0.5 text-xs gap-1", icon: "w-3 h-3" },
  md: { wrapper: "px-2.5 py-1 text-xs gap-1.5", icon: "w-3.5 h-3.5" },
  lg: { wrapper: "px-3 py-1.5 text-sm gap-2", icon: "w-4 h-4" },
};

export default function TrustBadge({
  score,
  level: levelOverride,
  size = "md",
  showScore = false,
  className = "",
}: TrustBadgeProps) {
  const level = levelOverride ?? getTrustLevel(score);
  const config = LEVEL_CONFIG[level];
  const sizes = SIZE_CLASSES[size];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${config.bg} ${config.text} ${config.border} ${sizes.wrapper} ${className}`}
      title={score != null ? `Trust score: ${score}/100` : "Trust level"}
    >
      <Icon className={`${sizes.icon} shrink-0`} />
      <span>{config.label}</span>
      {showScore && score != null && (
        <span className="opacity-60">· {score}</span>
      )}
    </span>
  );
}
