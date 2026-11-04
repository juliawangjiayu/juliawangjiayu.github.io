export type IdentityReason = 'leave a message' | 'save to leaderboard' | 'create a same-five invitation';

export class IdentityActionCoordinator {
  private pending: { reason: string; action: () => Promise<void> } | null = null;
  private running = false;

  get reason(): string | null {
    return this.pending?.reason ?? null;
  }

  async run(authenticated: boolean, reason: string, action: () => Promise<void>): Promise<void> {
    if (this.running) return;
    if (authenticated) {
      this.running = true;
      try { await action(); } finally { this.running = false; }
      return;
    }
    this.pending = { reason, action };
  }

  cancel(): void {
    if (!this.running) this.pending = null;
  }

  async resume(): Promise<void> {
    if (!this.pending || this.running) return;
    this.running = true;
    const current = this.pending;
    try {
      await current.action();
      if (this.pending === current) this.pending = null;
    } finally {
      this.running = false;
    }
  }
}
