import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** PataFundi brand assets in /public — deployed with Vercel build */
export const LOGO_FULL_URL = '/logo-full.png';
export const LOGO_URL = '/logo.png';
export const LOGO_ICON_URL = '/logo-icon.png';
export const FAVICON_URL = '/favicon.png';
export const APP_NAME = 'PataFundi';

const HEIGHT = {
  xs: 'h-8',
  sm: 'h-10',
  md: 'h-12',
  lg: 'h-20',
  xl: 'h-24',
} as const;

export type LogoSize = keyof typeof HEIGHT;

export interface BrandLogoProps {
  size?: LogoSize;
  /** Mascot icon only (compact headers). Default: full logo with wordmark */
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
  const candidates = iconOnly
    ? [LOGO_ICON_URL, LOGO_URL, LOGO_FULL_URL]
    : [LOGO_FULL_URL, LOGO_URL, LOGO_ICON_URL];

  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = candidates[index];

  const img = failed ? null : (
    <img
      src={src}
      alt=""
      role="presentation"
      className={cn(HEIGHT[size], 'w-auto shrink-0 object-contain')}
      decoding="async"
      onError={() => {
        if (index < candidates.length - 1) setIndex((i) => i + 1);
        else setFailed(true);
      }}
    />
  );

  const wrapper = cn('inline-flex items-center shrink-0', className);

  if (linkTo === false) {
    return <div className={wrapper}>{img}</div>;
  }

  return (
    <Link to={linkTo} className={wrapper} aria-label={APP_NAME}>
      {img}
    </Link>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return <BrandLogo className={className} />;
}
