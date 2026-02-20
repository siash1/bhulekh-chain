import { getAccessToken, getRefreshToken, setTokens, clearTokens, isTokenExpired } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export interface ApiError {
  status: number;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  public status: number;
  public code?: string;
  public details?: Record<string, unknown>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.status = error.status;
    this.code = error.code;
    this.details = error.details;
  }
}

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();

  if (token) {
    if (isTokenExpired(token)) {
      // Try to refresh the token
      const refreshToken = getRefreshToken();
      if (refreshToken && !isTokenExpired(refreshToken)) {
        try {
          const response = await fetch(buildUrl('/auth/refresh'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (response.ok) {
            const resp = await response.json();
            const data = resp.data ?? resp;
            setTokens(data.accessToken, data.refreshToken);
            headers['Authorization'] = `Bearer ${data.accessToken}`;
          } else {
            clearTokens();
          }
        } catch {
          clearTokens();
        }
      } else {
        clearTokens();
      }
    } else {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const authHeaders = await getAuthHeaders();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...options.headers,
  };

  const url = buildUrl(path, options.params);

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: options.signal,
  };

  if (body !== undefined && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  // Handle 401 specifically
  if (response.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken && !isTokenExpired(refreshToken)) {
      // Attempt token refresh and retry
      try {
        const refreshResponse = await fetch(buildUrl('/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshResponse.ok) {
          const resp = await refreshResponse.json();
          const data = resp.data ?? resp;
          setTokens(data.accessToken, data.refreshToken);

          // Retry original request with new token
          headers['Authorization'] = `Bearer ${data.accessToken}`;
          const retryResponse = await fetch(url, {
            ...fetchOptions,
            headers,
          });

          if (!retryResponse.ok) {
            const errorData = await retryResponse.json().catch(() => ({}));
            throw new ApiRequestError({
              status: retryResponse.status,
              message: errorData.message ?? 'Request failed after token refresh',
              code: errorData.code,
              details: errorData.details,
            });
          }

          return retryResponse.json() as Promise<T>;
        }
      } catch (error) {
        if (error instanceof ApiRequestError) throw error;
      }
    }

    // Token refresh failed or no refresh token
    clearTokens();
    throw new ApiRequestError({
      status: 401,
      message: 'Authentication required. Please log in again.',
      code: 'AUTH_REQUIRED',
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiRequestError({
      status: response.status,
      message: errorData.message ?? `Request failed with status ${response.status}`,
      code: errorData.code,
      details: errorData.details,
    });
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>, options?: RequestOptions): Promise<T> {
    return request<T>('GET', path, undefined, { ...options, params });
  },

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('POST', path, body, options);
  },

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('PUT', path, body, options);
  },

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('DELETE', path, undefined, options);
  },
};
