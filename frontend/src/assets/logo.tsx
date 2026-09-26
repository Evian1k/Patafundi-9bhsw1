import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** FundiHub brand constants — original identity (spec §37) */
export const APP_NAME = 'FundiHub';
export const SUPPORT_EMAIL = 'support@fundihub.com';

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
  /** Mark only (compact headers). Default: mark + wordmark */
  iconOnly?: boolean;
  className?: string;
  linkTo?: string | false;
  /** Render the wordmark in light text (dark surfaces) */
  inverted?: boolean;
}

/**
 * Original FundiHub mark: a rounded emerald tile with a "hub & spokes" glyph —
 * the marketplace connecting customers, fundis and companies. Drawn as inline
 * SVG so the brand is crisp at every size and never depends on stale assets.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn('shrink-0', className)}
      role="img"
      aria-label={APP_NAME}
    >
      <defs>
        <linearGradient id="fh-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#fh-tile)" />
      {/* hub */}
      <circle cx="24" cy="24" r="5.2" fill="#ffffff" />
      <circle cx="24" cy="24" r="8.6" fill="none" stroke="#a7f3d0" strokeWidth="2.4" />
      {/* spokes: customer · fundi · company */}
      <circle cx="24" cy="9.5" r="3.1" fill="#fbbf24" />
      <circle cx="11.5" cy="31.5" r="3.1" fill="#ffffff" />
      <circle cx="36.5" cy="31.5" r="3.1" fill="#ffffff" />
      <line x1="24" y1="15.4" x2="24" y2="12.6" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="18.4" y1="27" x2="14.2" y2="29.4" stroke="#d1fae5" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="29.6" y1="27" x2="33.8" y2="29.4" stroke="#d1fae5" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLogo({
  size = 'sm',
  iconOnly = false,
  className,
  linkTo = '/',
  inverted = false,
}: BrandLogoProps) {
  const markClass = cn(HEIGHT[size], 'w-auto aspect-square');
  const wordClass = cn(
    'font-display font-extrabold tracking-tight leading-none select-none',
    inverted ? 'text-white' : 'text-foreground',
    {
      xs: 'text-lg',
      sm: 'text-xl',
      md: 'text-2xl',
      lg: 'text-4xl',
      xl: 'text-5xl',
    }[size],
  );

  const content = (
    <>
      <BrandMark className={markClass} />
      {!iconOnly && (
        <span className={cn(wordClass, 'ml-2')}>
          Fundi<span className="text-emerald-500">Hub</span>
        </span>
      )}
    </>
  );

  const wrapper = cn('inline-flex items-center shrink-0', className);

  if (linkTo === false) {
    return <div className={wrapper}>{content}</div>;
  }

  return (
    <Link to={linkTo} className={wrapper} aria-label={APP_NAME}>
      {content}
    </Link>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return <BrandLogo className={className} />;
}
