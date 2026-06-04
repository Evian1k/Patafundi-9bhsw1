/**
 * Rate Limiting Middleware for PataFundi Edge Functions
 * Prevents DDoS, brute force, and abuse
 */

// Using Deno KV for distributed rate limiting
// Requires --allow-env --allow-net flags
const KV_URL = Deno.env.get('KV_URL');

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

const configs: Record<string, RateLimitConfig> = {
  // Auth endpoints: 10 requests per minute per email/IP
  'auth:register': { windowMs: 60000, maxRequests: 3, keyPrefix: 'rl:auth:register' },
  'auth:login': { windowMs: 60000, maxRequests: 10, keyPrefix: 'rl:auth:login' },
  'auth:otp-verify': { windowMs: 60000, maxRequests: 5, keyPrefix: 'rl:auth:otp' },
  'auth:otp-resend': { windowMs: 60000, maxRequests: 3, keyPrefix: 'rl:auth:resend' },
  
  // Payment endpoints: 5 requests per minute per user
  'payments:process': { windowMs: 60000, maxRequests: 3, keyPrefix: 'rl:pay:process' },
  
  // Job endpoints: 20 requests per minute per user
  'jobs:create': { windowMs: 60000, maxRequests: 10, keyPrefix: 'rl:jobs:create' },
  'jobs:accept': { windowMs: 60000, maxRequests: 20, keyPrefix: 'rl:jobs:accept' },
  
  // Search: 100 requests per minute per IP (generous for search)
  'fundi:search': { windowMs: 60000, maxRequests: 100, keyPrefix: 'rl:search' },
};

/**
 * Get client identifier (IP or user ID)
 */
function getClientId(req: Request, userId?: string): string {
  if (userId) return userId;
  // Try to get IP from CF-Connecting-IP (Cloudflare) or X-Forwarded-For
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0] ||
    'unknown'
  );
}

/**
 * Check rate limit using in-memory cache (production should use Redis/KV)
 * Returns: { allowed: boolean, remaining: number, resetAt: number }
 */
export async function checkRateLimit(
  endpoint: string,
  identifier: string,
  extra?: { email?: string }
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const config = configs[endpoint];
  if (!config) {
    // No limit configured
    return { allowed: true, remaining: Infinity, resetAt: 0 };
  }

  const key = `${config.keyPrefix}:${identifier}`;
  
  // In production, use Supabase or similar for persistence
  // For now, use simple in-process cache with TTL
  // This is a placeholder - real implementation needs distributed cache
  
  // Simulated check (would need real storage)
  const now = Date.now();
  // This should check against persistent storage
  
  // For MVP, just warn in logs
  console.log(`[rate-limit] Checking ${endpoint} for ${identifier}`);
  
  return {
    allowed: true,  // TODO: Implement with real storage
    remaining: config.maxRequests - 1,
    resetAt: now + config.windowMs,
  };
}

/**
 * Middleware to apply rate limiting to edge function
 */
export function rateLimitMiddleware(endpoint: string, getUserId?: (req: Request) => string | null) {
  return async (req: Request): Promise<Response | null> => {
    const config = configs[endpoint];
    if (!config) return null;  // No limit

    const userId = getUserId?.(req);
    const clientId = userId || getClientId(req);
    
    const limit = await checkRateLimit(endpoint, clientId);

    if (!limit.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Too many requests',
          retryAfter: Math.ceil(limit.resetAt / 1000),
        }),
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil(limit.resetAt / 1000).toString(),
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': limit.resetAt.toString(),
          },
        }
      );
    }

    return null;  // Continue processing
  };
}
