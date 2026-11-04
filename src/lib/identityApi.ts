export const VISITOR_TOKEN_KEY = 'julia-photo-visitor-session';

export type PublicVisitor = { id: string; username: string };
type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class IdentityApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createIdentityClient(baseUrl: string, storage: TokenStorage, fetcher: typeof fetch = fetch) {
  const endpoint = baseUrl.replace(/\/$/, '');
  const token = () => storage.getItem(VISITOR_TOKEN_KEY);
  const clear = () => storage.removeItem(VISITOR_TOKEN_KEY);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const currentToken = token();
    const response = await fetcher(`${endpoint}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(currentToken ? { authorization: `Bearer ${currentToken}` } : {}),
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({})) as T & { code?: string; message?: string; error?: string };
    if (!response.ok) {
      if (response.status === 401) clear();
      throw new IdentityApiError(body.message ?? body.error ?? 'The request could not be completed.', response.status, body.code);
    }
    return body;
  }

  return {
    token,
    clear,
    request,
    async signIn(username: string, email: string): Promise<PublicVisitor> {
      const result = await request<{ token: string; visitor: PublicVisitor }>('/api/identity/session', {
        method: 'POST',
        body: JSON.stringify({ username, email }),
      });
      storage.setItem(VISITOR_TOKEN_KEY, result.token);
      return result.visitor;
    },
    async me(): Promise<PublicVisitor> {
      if (!token()) throw new IdentityApiError('Sign in first.', 401, 'unauthorized');
      const result = await request<{ visitor: PublicVisitor }>('/api/identity/me');
      return result.visitor;
    },
    async signOut(): Promise<void> {
      if (token()) await request('/api/identity/session', { method: 'DELETE' });
      clear();
    },
  };
}

export function browserIdentityClient() {
  return createIdentityClient(import.meta.env.VITE_WORKER_BASE_URL?.trim() ?? '', window.localStorage);
}
