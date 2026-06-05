/** Single source of truth for PataFundi brand asset paths (Vercel-ready /public files). */
export const LOGO_URL = '/logo.png';
export const FAVICON_URL = '/favicon.png';
export const APP_NAME = 'PataFundi';

export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface BrandLogoProps {
  size?: LogoSize;
  showWordmark?: boolean;
  className?: string;
}
