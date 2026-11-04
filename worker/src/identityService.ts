import { createSessionToken, emailVerifier, hashSessionToken, IdentityError, normalizeUsername } from './identity.ts';
import type { IdentityRepository, VisitorRecord } from './repository.ts';

export interface IssuedIdentitySession { token: string; visitor: VisitorRecord }
export class IdentityService {
  private readonly repository: IdentityRepository;
  private readonly options: { pepper: string; now: () => Date; createId: (kind: 'visitor') => string };
  constructor(repository: IdentityRepository, options: { pepper: string; now: () => Date; createId: (kind: 'visitor') => string }) { this.repository = repository; this.options = options; }

  async authenticate(usernameInput: string, emailInput: string): Promise<IssuedIdentitySession> {
    const { username, usernameKey } = normalizeUsername(usernameInput);
    const verifier = await emailVerifier(emailInput, this.options.pepper);
    const byName = await this.repository.findVisitorByUsernameKey(usernameKey);
    const byEmail = await this.repository.findVisitorByEmailVerifier(verifier);
    if ((byName && byName.emailVerifier !== verifier) || (byEmail && byEmail.usernameKey !== usernameKey)) {
      throw new IdentityError('identity_mismatch', 'That username and email do not match an existing identity, or one is already in use.');
    }
    const timestamp = this.options.now().toISOString();
    const visitor = byName ?? byEmail ?? {
      id: this.options.createId('visitor'), username, usernameKey, emailVerifier: verifier,
      createdAt: timestamp, updatedAt: timestamp,
    };
    if (!byName && !byEmail) {
      try { await this.repository.createVisitor(visitor); }
      catch {
        throw new IdentityError('identity_mismatch', 'That username and email do not match an existing identity, or one is already in use.');
      }
    }
    const token = createSessionToken();
    const tokenHash = await hashSessionToken(token);
    await this.repository.deleteExpiredVisitorSessions(visitor.id, timestamp);
    await this.repository.createVisitorSession({
      tokenHash, visitorId: visitor.id, createdAt: timestamp, lastSeenAt: timestamp,
      expiresAt: new Date(this.options.now().getTime() + 90 * 86400000).toISOString(),
    });
    const sessions = await this.repository.listVisitorSessions(visitor.id);
    if (sessions.length > 5) {
      await this.repository.deleteVisitorSessions(sessions.slice(0, sessions.length - 5).map((item) => item.tokenHash));
    }
    return { token, visitor };
  }

  async resolve(token: string): Promise<VisitorRecord | null> {
    const tokenHash = await hashSessionToken(token);
    const session = await this.repository.getVisitorSession(tokenHash);
    if (!session) return null;
    const current = this.options.now().getTime();
    if (current >= Date.parse(session.expiresAt) || current >= Date.parse(session.lastSeenAt) + 30 * 86400000) {
      await this.repository.revokeVisitorSession(tokenHash);
      return null;
    }
    if (current >= Date.parse(session.lastSeenAt) + 3600000) {
      await this.repository.touchVisitorSession(tokenHash, this.options.now().toISOString());
    }
    return this.repository.getVisitor(session.visitorId);
  }

  async revoke(token: string): Promise<void> {
    await this.repository.revokeVisitorSession(await hashSessionToken(token));
  }
}
