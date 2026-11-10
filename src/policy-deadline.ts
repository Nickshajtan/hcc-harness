type Settlement<T> =
  | { readonly status: 'fulfilled'; readonly value: T }
  | { readonly status: 'rejected'; readonly cause: unknown }
  | { readonly status: 'timeout' };

/** One dispatch owns the absolute deadline, cancellation signal and shared cleanup grace. */
export class PolicyDeadline {
  private readonly controller = new AbortController();
  private readonly expiresAt: number;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(
    timeoutMs: number,
    private readonly cleanupGraceMs: number,
  ) {
    this.expiresAt = performance.now() + timeoutMs;
    this.timer = setTimeout(() => {
      this.controller.abort();
    }, timeoutMs);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  hasExpired(): boolean {
    // A synchronous callback may delay timer delivery past the actual deadline.
    if (performance.now() >= this.expiresAt) {
      this.controller.abort();
    }
    return this.signal.aborted;
  }

  wait<T>(operation: () => T | Promise<T>, phase: 'handler' | 'cleanup'): Promise<Settlement<T>> {
    const end = this.expiresAt + ('cleanup' === phase ? this.cleanupGraceMs : 0);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: Settlement<T>) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        // A late fulfillment must not win merely because the timer was delayed.
        if ('timeout' === result.status || performance.now() >= end) {
          this.controller.abort();
          resolve({ status: 'timeout' });
        } else {
          resolve(result);
        }
      };
      const timer = setTimeout(
        () => {
          finish({ status: 'timeout' });
        },
        Math.max(0, Math.ceil(end - performance.now())),
      );
      try {
        // Both continuations remain attached after timeout, containing late rejections.
        void Promise.resolve(operation()).then(
          (value) => {
            finish({ status: 'fulfilled', value });
          },
          (cause: unknown) => {
            finish({ status: 'rejected', cause });
          },
        );
      } catch (cause) {
        finish({ status: 'rejected', cause });
      }
    });
  }

  dispose(): void {
    clearTimeout(this.timer);
  }
}
