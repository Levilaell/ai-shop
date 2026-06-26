/**
 * A counting semaphore for bounding concurrency. Used to enforce the HeyGen
 * "max 10 concurrent jobs" limit (spec §5) independently of the worker's overall
 * concurrency. FIFO fairness: waiters are released in arrival order.
 */
export class Semaphore {
  private permits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    if (!Number.isInteger(permits) || permits <= 0) {
      throw new Error(`Semaphore permits must be a positive integer, got ${permits}`);
    }
    this.permits = permits;
  }

  /** Permits currently available. */
  get available(): number {
    return this.permits;
  }

  /** Tasks waiting for a permit. */
  get waiting(): number {
    return this.waiters.length;
  }

  /** Acquire a permit, waiting if none are free. */
  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** Release a permit, handing it directly to the next waiter if any. */
  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next(); // permit passes straight to the waiter; count stays the same
    } else {
      this.permits++;
    }
  }

  /** Run `fn` while holding a permit, always releasing it afterward. */
  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
