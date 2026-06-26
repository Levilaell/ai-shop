import { describe, it, expect } from 'vitest';
import { Semaphore } from './semaphore.js';

describe('Semaphore', () => {
  it('rejects a non-positive permit count', () => {
    expect(() => new Semaphore(0)).toThrow();
    expect(() => new Semaphore(-1)).toThrow();
  });

  it('grants up to `permits` acquisitions without blocking', async () => {
    const s = new Semaphore(2);
    await s.acquire();
    await s.acquire();
    expect(s.available).toBe(0);
  });

  it('blocks the (n+1)th acquire until a release', async () => {
    const s = new Semaphore(1);
    await s.acquire();
    let acquired = false;
    const p = s.acquire().then(() => {
      acquired = true;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(s.waiting).toBe(1);
    s.release();
    await p;
    expect(acquired).toBe(true);
  });

  it('never exceeds the permit limit under contention', async () => {
    const limit = 10;
    const s = new Semaphore(limit);
    let active = 0;
    let peak = 0;
    const task = async (): Promise<void> => {
      await s.withPermit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 1));
        active--;
      });
    };
    await Promise.all(Array.from({ length: 50 }, task));
    expect(peak).toBeLessThanOrEqual(limit);
    expect(s.available).toBe(limit);
    expect(s.waiting).toBe(0);
  });

  it('releases waiters in FIFO order', async () => {
    const s = new Semaphore(1);
    await s.acquire();
    const order: number[] = [];
    const p1 = s.acquire().then(() => order.push(1));
    const p2 = s.acquire().then(() => order.push(2));
    const p3 = s.acquire().then(() => order.push(3));
    s.release();
    s.release();
    s.release();
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });
});
