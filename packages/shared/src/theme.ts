/**
 * PataFundi Shared Theme — mirrors src/index.css + tailwind.config.ts exactly.
 * Brand: Warm Amber primary + Teal accent + Inter/Plus Jakarta Sans fonts.
 */
export const colors = {
  primary: '#F97316', primaryDark: '#C2410C', primaryLight: '#FED7AA', primaryForeground: '#FFFFFF',
  accent: '#1E9E8A', accentDark: '#0E6B5C', accentLight: '#5EEAD4', accentForeground: '#FFFFFF',
  background: '#FBFAF8', foreground: '#1C1917',
  card: '#FFFFFF', cardForeground: '#1C1917',
  secondary: '#EDEAE3', secondaryForeground: '#33291F',
  muted: '#EEEAE3', mutedForeground: '#6B6560',
  destructive: '#EF4444', destructiveForeground: '#FFFFFF',
  success: '#27A35F', successForeground: '#FFFFFF',
  warning: '#FBBF24', warningForeground: '#1C1917',
  error: '#EF4444', info: '#3B82F6',
  border: '#E2DFD9', input: '#E2DFD9', ring: '#F97316',
  text: '#1C1917', textSecondary: '#6B6560', textLight: '#FFFFFF',
  surface: '#FFFFFF', surfaceDark: '#1E293B',
  dark: {
    background: '#1A1612', foreground: '#F5F1EC', card: '#1F1A14',
    primary: '#FB923C', accent: '#2DD4BF', border: '#2A2520',
    text: '#F5F1EC', textSecondary: '#8A8278',
  },
} as const;

export const gradients = {
  primary: { start: '#F97316', end: '#C2410C', angle: 135 },
  accent: { start: '#1E9E8A', end: '#0E6B5C', angle: 135 },
  warm: { start: '#FBFAF8', end: '#F5EFE6', angle: 135 },
  hero: { start: '#FBFAF8', end: '#EDEAE3', angle: 180 },
} as const;

export const fonts = { sans: 'Inter', display: 'PlusJakartaSans', mono: 'monospace' } as const;

export const fontSize = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, title: 28, hero: 34 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const borderRadius = { sm: 8, md: 10, lg: 12, xl: 16, '2xl': 20, pill: 999 } as const;

export const shadows = {
  sm: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },
  lg: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 15, elevation: 6 },
  glow: { shadowColor: '#F97316', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 40, elevation: 0 },
} as const;

export const SERVICE_CATEGORIES = [
  { slug: 'plumbing', label: 'Plumbing', icon: '🔧' },
  { slug: 'electrical', label: 'Electrical', icon: '⚡' },
  { slug: 'carpentry', label: 'Carpentry', icon: '🔨' },
  { slug: 'cleaning', label: 'Cleaning', icon: '✨' },
  { slug: 'painting', label: 'Painting', icon: '🎨' },
  { slug: 'hvac', label: 'AC & HVAC', icon: '❄️' },
  { slug: 'roofing', label: 'Roofing', icon: '🏠' },
  { slug: 'welding', label: 'Welding', icon: '🔥' },
  { slug: 'appliance-repair', label: 'Appliance Repair', icon: '⚙️' },
  { slug: 'pest-control', label: 'Pest Control', icon: '🐛' },
  { slug: 'masonry', label: 'Masonry', icon: '🧱' },
  { slug: 'gardening', label: 'Gardening', icon: '🌱' },
  { slug: 'moving-services', label: 'Moving', icon: '🚚' },
  { slug: 'vehicle-services', label: 'Vehicle', icon: '🚗' },
] as const;

export const JOB_STATUS_LABELS: Record<string, string> = {
  matching: 'Finding Fundi', accepted: 'Fundi On The Way', in_progress: 'Work In Progress',
  completed: 'Completed', cancelled: 'Cancelled', failed: 'Failed', disputed: 'Disputed',
} as const;

export const JOB_STATUS_COLORS: Record<string, string> = {
  matching: '#FBBF24', accepted: '#3B82F6', in_progress: '#8B5CF6',
  completed: '#27A35F', cancelled: '#EF4444', failed: '#EF4444', disputed: '#FBBF24',
} as const;
