import type { IdentityRepository } from './repository.ts';

export async function enforceRateLimit(repository: IdentityRepository, options: {
  scope: string; subjectHash: string; max: number; windowSeconds: number; now: string;
}): Promise<boolean> {
  const since = new Date(Date.parse(options.now) - options.windowSeconds * 1000).toISOString();
  return repository.consumeRateLimitEvent(options.scope, options.subjectHash, options.now, since, options.max);
}
