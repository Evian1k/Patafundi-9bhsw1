import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Public paths — files in /public, copied to Vercel dist root on build. */
export const LOGO_FULL_URL = '/logo-full.png';
export const LOGO_URL = '/logo.png';
export const LOGO_ICON_URL = '/logo-icon.png';
export const FAVICON_URL = '/favicon.png';
export const APP_NAME = 'PataFundi';

const HEIGHT_CLASS = {
  xs: 'h-7',
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-12',
  xl: 'h-16',
} as const;

export type LogoSize = keyof typeof HEIGHT_CLASS;

export interface BrandLogoProps {
  size?: LogoSize;
  /** @deprecated Wordmark is baked into logo-full.png — do not use */
  showWordmark?: boolean;
  iconOnly?: boolean;
  className?: string;
  linkTo?: string | false;
}

export function BrandLogo({
  size = 'sm',
  iconOnly = false,
  className,
  linkTo = '/',
}: BrandLogoProps) {
  const primary = iconOnly ? LOGO_ICON_URL : LOGO_FULL_URL;
  const fallback = iconOnly ? LOGO_URL : LOGO_URL;
  const [src, setSrc] = useState(primary);
  const [failed, setFailed] = useState(false);

  const img = failed ? (
    <span className={cn(HEIGHT_CLASS[size], 'inline-flex items-center font-display font-bold text-sm')}>
      {APP_NAME}
    </span>
  ) : (
    <img
      src={src}
      alt=""
      role="presentation"
      className={cn(HEIGHT_CLASS[size], 'w-auto shrink-0 object-contain')}
      decoding="async"
      onError={() => {
        if (src !== fallback) setSrc(fallback);
        else setFailed(true);
      }}
    />
  );

  const wrapper = cn('inline-flex items-center shrink-0', className);

  if (linkTo === false) return <div className={wrapper}>{img}</div>;
  return (
    <Link to={linkTo} className={wrapper} aria-label={APP_NAME}>
      {img}
    </Link>
  );
}

/** @deprecated Use BrandLogo — wordmark is in the image */
export function BrandWordmark({ className }: { className?: string }) {
  return <BrandLogo size="sm" linkTo={false} className={className} />;
}
