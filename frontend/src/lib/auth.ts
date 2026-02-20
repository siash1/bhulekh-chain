const ACCESS_TOKEN_KEY = 'bhulekhchain_access_token';
const REFRESH_TOKEN_KEY = 'bhulekhchain_refresh_token';

/**
 * Parse a JWT token payload without external libraries.
 * This does NOT validate the signature -- it only decodes the payload.
 */
function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired.
 * Returns true if the token is expired or cannot be parsed.
 * Includes a 30-second buffer to account for clock skew.
 */
export function isTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') {
    return true;
  }

  const bufferSeconds = 30;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - bufferSeconds <= nowSeconds;
}

/**
 * Get the stored access token.
 * Returns null if not in a browser environment or token doesn't exist.
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Get the stored refresh token.
 * Returns null if not in a browser environment or token doesn't exist.
 */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Store both access and refresh tokens.
 */
export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/**
 * Remove all stored tokens. Used on logout or when tokens are invalid.
 */
export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Get user info from the access token payload.
 * Returns null if no valid token exists.
 */
export function getUserFromToken(): {
  id: string;
  name: string;
  role: string;
  stateCode: string;
} | null {
  const token = getAccessToken();
  if (!token || isTokenExpired(token)) return null;

  const payload = parseJwtPayload(token);
  if (!payload) return null;

  return {
    id: (payload.sub as string) ?? '',
    name: (payload.name as string) ?? '',
    role: (payload.role as string) ?? 'citizen',
    stateCode: (payload.stateCode as string) ?? '',
  };
}

/**
 * Check if the user is currently authenticated with a valid access token.
 */
export function isAuthenticated(): boolean {
  const token = getAccessToken();
  return token !== null && !isTokenExpired(token);
}
