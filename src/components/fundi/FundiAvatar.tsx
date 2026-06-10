import { ShieldCheck, User } from 'lucide-react';

interface FundiAvatarProps {
  name?: string;
  photoUrl?: string | null;
  verified?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 'h-8 w-8', md: 'h-12 w-12', lg: 'h-16 w-16' };
const iconSizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };

export default function FundiAvatar({ name, photoUrl, verified, size = 'md', className = '' }: FundiAvatarProps) {
  const initials = (name || 'F').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div className={`${sizes[size]} rounded-full overflow-hidden bg-primary/10 flex items-center justify-center border-2 border-background shadow-sm`}>
        {photoUrl ? (
          <img src={photoUrl} alt={name || 'Fundi'} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs font-bold text-primary">{initials}</span>
        )}
      </div>
      {verified && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-white ring-2 ring-background" title="Verified Fundi">
          <ShieldCheck className={size === 'lg' ? 'h-3 w-3' : 'h-2.5 w-2.5'} />
        </span>
      )}
    </div>
  );
}
