import assert from 'node:assert/strict';
import test from 'node:test';

import { IdentityActionCoordinator } from '../src/lib/identityAction.ts';

test('identity action pauses anonymously and resumes exactly once', async () => {
  const coordinator = new IdentityActionCoordinator();
  let calls = 0;
  await coordinator.run(false, 'save to leaderboard', async () => { calls += 1; });
  assert.equal(calls, 0);
  assert.equal(coordinator.reason, 'save to leaderboard');
  await Promise.all([coordinator.resume(), coordinator.resume()]);
  assert.equal(calls, 1);
  assert.equal(coordinator.reason, null);
});

test('identity action cancellation and authenticated calls', async () => {
  const coordinator = new IdentityActionCoordinator();
  let calls = 0;
  await coordinator.run(false, 'create an invitation', async () => { calls += 1; });
  coordinator.cancel();
  await coordinator.resume();
  assert.equal(calls, 0);
  await coordinator.run(true, 'save to leaderboard', async () => { calls += 1; });
  assert.equal(calls, 1);
});

test('identity action failure stays retryable without automatic replay', async () => {
  const coordinator = new IdentityActionCoordinator();
  let attempts = 0;
  await coordinator.run(false, 'create an invitation', async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('network');
  });
  await assert.rejects(coordinator.resume(), /network/);
  assert.equal(coordinator.reason, 'create an invitation');
  assert.equal(attempts, 1);
  await coordinator.resume();
  assert.equal(attempts, 2);
  assert.equal(coordinator.reason, null);
});
