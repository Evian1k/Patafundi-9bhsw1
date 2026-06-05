import { Link } from 'react-router-dom';
import { LOGO_URL, APP_NAME } from '@/assets/logo';
import type { BrandLogoProps, LogoSize } from '@/assets/logo';

// Re-export constants and types so consumers can import from either path
export { LOGO_URL, FAVICON_URL, APP_NAME } from '@/assets/logo';
export type { BrandLogoProps, LogoSize } from '@/assets/logo';

const SIZE_MAP: Record<LogoSize, number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
};

const TEXT_SIZE_MAP: Record<LogoSize, string> = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
};

export function BrandLogo({ size = 'md', showWordmark = false, className = '' }: BrandLogoProps) {
  const px = SIZE_MAP[size];
  const textCls = TEXT_SIZE_MAP[size];

  return (
    <Link to="/" className={`inline-flex items-center gap-2 ${className}`} aria-label={APP_NAME}>
      <img
        src={LOGO_URL}
        alt={`${APP_NAME} logo`}
        width={px}
        height={px}
        className="object-contain"
      />
      {showWordmark && (
        <span className={`font-bold tracking-tight ${textCls}`}>{APP_NAME}</span>
      )}
    </Link>
  );
}

export function BrandWordmark({ size = 'md', className = '' }: { size?: LogoSize; className?: string }) {
  const textCls = TEXT_SIZE_MAP[size];
  return <span className={`font-bold tracking-tight ${textCls} ${className}`}>{APP_NAME}</span>;
}
