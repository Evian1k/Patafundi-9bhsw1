/**
 * PataFundi Shared Theme — Apple/Uber-grade design system.
 *
 * Design language: Apple HIG + Uber simplicity + Airbnb cleanliness + Stripe spacing.
 * Brand: Warm Amber primary + Teal accent + Inter/Plus Jakarta Sans fonts.
 *
 * Every value here is the single source of truth for both mobile apps.
 * The web frontend uses the same tokens via src/index.css CSS variables.
 */

// ── Brand Colors ──────────────────────────────────────────────
export const colors = {
  // Primary — Warm Amber
  primary: '#F97316',
  primaryDark: '#C2410C',
  primaryLight: '#FED7AA',
  primaryLighter: '#FFF7ED',
  primaryForeground: '#FFFFFF',

  // Accent — Teal
  accent: '#1E9E8A',
  accentDark: '#0E6B5C',
  accentLight: '#5EEAD4',
  accentLighter: '#ECFDF5',
  accentForeground: '#FFFFFF',

  // Neutrals (warm gray, not cold blue-gray)
  background: '#FBFAF8',
  foreground: '#1C1917',
  card: '#FFFFFF',
  cardForeground: '#1C1917',
  secondary: '#F5F3EF',
  secondaryForeground: '#33291F',
  muted: '#F5F3EF',
  mutedForeground: '#78716C',

  // Status
  success: '#27A35F',
  successLight: '#DCFCE7',
  successForeground: '#FFFFFF',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  warningForeground: '#1C1917',
  destructive: '#EF4444',
  destructiveLight: '#FEE2E2',
  destructiveForeground: '#FFFFFF',
  error: '#EF4444',
  info: '#3B82F6',
  infoLight: '#DBEAFE',

  // Borders + inputs
  border: '#E7E5E4',
  borderLight: '#F5F3EF',
  input: '#E7E5E4',
  ring: '#F97316',

  // Text (legacy aliases)
  text: '#1C1917',
  textSecondary: '#78716C',
  textTertiary: '#A8A29E',
  textLight: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceDark: '#1E293B',

  // Dark mode
  dark: {
    background: '#0F0E0D',
    foreground: '#F5F3EF',
    card: '#1A1816',
    cardForeground: '#F5F3EF',
    primary: '#FB923C',
    primaryDark: '#F97316',
    accent: '#2DD4BF',
    accentDark: '#1E9E8A',
    secondary: '#292524',
    secondaryForeground: '#F5F3EF',
    muted: '#292524',
    mutedForeground: '#A8A29E',
    border: '#292524',
    input: '#292524',
    text: '#F5F3EF',
    textSecondary: '#A8A29E',
    textTertiary: '#78716C',
  },
} as const;

// ── Gradients ─────────────────────────────────────────────────
export const gradients = {
  primary: { start: '#F97316', end: '#EA580C', angle: 135 },
  primaryDeep: { start: '#F97316', end: '#C2410C', angle: 135 },
  accent: { start: '#1E9E8A', end: '#0E6B5C', angle: 135 },
  accentLight: { start: '#5EEAD4', end: '#1E9E8A', angle: 135 },
  warm: { start: '#FBFAF8', end: '#F5EFE6', angle: 135 },
  hero: { start: '#FBFAF8', end: '#EDEAE3', angle: 180 },
  success: { start: '#27A35F', end: '#15803D', angle: 135 },
  danger: { start: '#EF4444', end: '#DC2626', angle: 135 },
} as const;

// ── Typography ────────────────────────────────────────────────
export const fonts = {
  sans: 'Inter',
  display: 'PlusJakartaSans',
  mono: 'SF Mono',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  title: 28,
  hero: 34,
  mega: 40,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const lineHeight = {
  tight: 1.2,
  snug: 1.35,
  normal: 1.5,
  relaxed: 1.65,
} as const;

// ── Spacing (8pt grid system) ─────────────────────────────────
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

// ── Border Radius ─────────────────────────────────────────────
export const borderRadius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  pill: 999,
} as const;

// ── Shadows (Apple-style soft elevation) ──────────────────────
export const shadows = {
  xs: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  sm: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  md: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  lg: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.10, shadowRadius: 24, elevation: 8 },
  xl: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.12, shadowRadius: 32, elevation: 12 },
  glow: { shadowColor: '#F97316', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.20, shadowRadius: 24, elevation: 0 },
  accentGlow: { shadowColor: '#1E9E8A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.20, shadowRadius: 24, elevation: 0 },
} as const;

// ── Component Tokens (Apple HIG + Uber inspired) ──────────────
export const components = {
  button: {
    height: { sm: 36, md: 44, lg: 48 },
    paddingX: { sm: 16, md: 20, lg: 28 },
    fontSize: { sm: fontSize.sm, md: fontSize.md, lg: fontSize.lg },
    fontWeight: fontWeight.semibold,
    radius: borderRadius.lg,
    iconSize: { sm: 16, md: 18, lg: 22 },
  },
  input: {
    height: 46,
    paddingX: 16,
    paddingY: 12,
    fontSize: fontSize.md,
    radius: borderRadius.lg,
    borderWidth: 1,
  },
  card: {
    padding: 20,
    radius: borderRadius.xl,
    shadow: shadows.sm,
  },
  tabBar: {
    height: 56,
    marginBottom: 24, // floating gap from bottom
    marginHorizontal: 16,
    radius: borderRadius['2xl'],
    iconSize: 24,
    labelSize: fontSize.xs,
  },
  header: {
    height: 56,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as '700',
  },
  listItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
    iconSize: 22,
    avatarSize: 40,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    radius: borderRadius.pill,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as '500',
  },
} as const;

// ── Animation Durations (iOS-style) ───────────────────────────
export const animations = {
  fast: 200,
  normal: 300,
  slow: 500,
  spring: { damping: 0.7, stiffness: 300 },
  screen: { duration: 300, type: 'slide' as const },
} as const;

// ── Service Categories (premium Ionicons names, NO emoji) ─────
// Each icon maps to @expo/vector-icons Ionicons name.
export const SERVICE_CATEGORIES = [
  { slug: 'plumbing',           label: 'Plumbing',          icon: 'water',          color: '#3B82F6' },
  { slug: 'electrical',         label: 'Electrical',        icon: 'flash',          color: '#F59E0B' },
  { slug: 'carpentry',          label: 'Carpentry',         icon: 'build',          color: '#92400E' },
  { slug: 'cleaning',           label: 'Cleaning',          icon: 'sparkles',       color: '#1E9E8A' },
  { slug: 'painting',           label: 'Painting',          icon: 'color-palette',  color: '#8B5CF6' },
  { slug: 'hvac',               label: 'AC & HVAC',         icon: 'snow',           color: '#06B6D4' },
  { slug: 'roofing',            label: 'Roofing',           icon: 'home',           color: '#DC2626' },
  { slug: 'welding',            label: 'Welding',           icon: 'flame',          color: '#EA580C' },
  { slug: 'appliance-repair',   label: 'Appliance Repair',  icon: 'construct',      color: '#64748B' },
  { slug: 'pest-control',       label: 'Pest Control',      icon: 'bug',            color: '#84CC16' },
  { slug: 'masonry',            label: 'Masonry',           icon: 'cube',           color: '#78716C' },
  { slug: 'gardening',          label: 'Gardening',         icon: 'leaf',           color: '#27A35F' },
  { slug: 'moving-services',    label: 'Moving',            icon: 'cube-box',       color: '#F97316' },
  { slug: 'vehicle-services',   label: 'Vehicle',           icon: 'car',            color: '#0EA5E9' },
] as const;

// ── Job Status ────────────────────────────────────────────────
export const JOB_STATUS_LABELS: Record<string, string> = {
  matching: 'Finding Fundi',
  accepted: 'Fundi On The Way',
  in_progress: 'Work In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  disputed: 'Disputed',
} as const;

export const JOB_STATUS_COLORS: Record<string, string> = {
  matching: '#F59E0B',
  accepted: '#3B82F6',
  in_progress: '#8B5CF6',
  completed: '#27A35F',
  cancelled: '#EF4444',
  failed: '#EF4444',
  disputed: '#F59E0B',
} as const;

export const JOB_STATUS_ICONS: Record<string, string> = {
  matching: 'search',
  accepted: 'navigate',
  in_progress: 'build',
  completed: 'checkmark-circle',
  cancelled: 'close-circle',
  failed: 'alert-circle',
  disputed: 'warning',
} as const;
