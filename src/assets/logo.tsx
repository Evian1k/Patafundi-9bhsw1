import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

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
  showWordmark?: boolean;
  iconOnly?: boolean;
  className?: string;
  linkTo?: string | false;
}

export function BrandLogo({
  size = 'sm',
  showWordmark = false,
  iconOnly = false,
  className,
  linkTo = '/',
}: BrandLogoProps) {
  const src = iconOnly ? LOGO_ICON_URL : LOGO_FULL_URL;
  const content = (
    <>
      <img
        src={src}
        alt={`${APP_NAME} logo`}
        className={cn(HEIGHT_CLASS[size], 'w-auto shrink-0 object-contain')}
        decoding="async"
      />
      {showWordmark && (
        <span className="font-display font-bold text-lg">
          Pata<span className="text-primary">Fundi</span>
        </span>
      )}
    </>
  );

  const wrapper = cn('inline-flex items-center gap-2 shrink-0', className);

  if (linkTo === false) return <div className={wrapper}>{content}</div>;
  return (
    <Link to={linkTo} className={wrapper} aria-label={APP_NAME}>
      {content}
    </Link>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display font-bold', className)}>
      Pata<span className="text-primary">Fundi</span>
    </span>
  );
}
