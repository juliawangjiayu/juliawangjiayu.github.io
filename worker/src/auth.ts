import type { IdentityService } from './identityService.ts';
import type { VisitorRecord } from './repository.ts';

export class AuthenticationError extends Error {
  readonly code = 'unauthorized';
  constructor() { super('A valid visitor session is required.'); }
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  return match?.[1] ?? null;
}

export async function optionalVisitor(request: Request, identity: IdentityService): Promise<VisitorRecord | null> {
  const token = bearerToken(request);
  return token ? identity.resolve(token) : null;
}

export async function requireVisitor(request: Request, identity: IdentityService): Promise<VisitorRecord> {
  const visitor = await optionalVisitor(request, identity);
  if (!visitor) throw new AuthenticationError();
  return visitor;
}
