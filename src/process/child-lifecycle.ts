import type { ChildProcess } from 'node:child_process';

export interface LaunchResult {
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
}

// Running -> cancellation requested -> settled, or running -> settled.
// An observed exit suppresses cancellation while close is still pending. Both
// error and close can settle, but only the first owns the result and disposal.
export class ChildExecution {
  private timer: NodeJS.Timeout | undefined;
  private settled = false;
  private cancelled = false;

  constructor(
    private readonly child: ChildProcess,
    private readonly signal: AbortSignal,
    private readonly resolveResult: (result: LaunchResult) => void,
    private readonly reject: (error: unknown) => void,
  ) {}

  observe(): void {
    this.child.once('error', this.failed);
    this.child.once('close', this.closed);
    this.signal.addEventListener('abort', this.abort, { once: true });
    // Cover an exit or abort occurring while spawn/listeners were initialized.
    if (null !== this.child.exitCode || null !== this.child.signalCode) {
      this.closed(this.child.exitCode, this.child.signalCode);
    } else if (this.signal.aborted) {
      this.abort();
    }
  }

  private dispose(): void {
    this.signal.removeEventListener('abort', this.abort);
    clearTimeout(this.timer);
    this.child.off('error', this.failed);
    this.child.off('close', this.closed);
  }

  private readonly failed = (error: unknown): void => {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.dispose();
    this.reject(error);
  };

  private readonly closed = (code: number | null, nativeSignal: NodeJS.Signals | null): void => {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.dispose();
    this.resolveResult(Object.freeze({ exitCode: code ?? 1, signal: nativeSignal }));
  };

  private readonly abort = (): void => {
    if (
      this.cancelled ||
      this.settled ||
      null !== this.child.exitCode ||
      null !== this.child.signalCode
    ) {
      return;
    }
    this.cancelled = true;
    const reason: unknown = this.signal.reason;
    const forwarded =
      'SIGINT' === reason || 'SIGTERM' === reason || 'SIGHUP' === reason ? reason : 'SIGTERM';
    this.terminateGracefully(forwarded);
  };

  private terminateGracefully(forwarded: NodeJS.Signals): void {
    try {
      this.child.kill('win32' === process.platform ? 'SIGTERM' : forwarded);
    } catch (error) {
      this.failed(error);
      return;
    }
    // kill can synchronously emit an error/close. Never install a timer afterward.
    if (this.settled) {
      return;
    }
    // A false kill result is not completion: keep waiting and retain escalation.
    this.timer = setTimeout(this.escalate, 3000);
    this.timer.unref();
  }

  private readonly escalate = (): void => {
    if (this.settled || null !== this.child.exitCode || null !== this.child.signalCode) {
      return;
    }
    try {
      this.child.kill('SIGKILL');
    } catch (error) {
      this.failed(error);
    }
  };
}
