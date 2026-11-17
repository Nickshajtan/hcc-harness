import { isPromise } from 'node:util/types';

/** Registration cannot suspend its admission window. Async work belongs in handlers. */
export function assertSynchronousRegistration(returned: unknown, message: string): void {
  if (undefined === returned) {
    return;
  }
  if (isPromise(returned)) {
    // Observe genuine Promises without invoking user-defined then/catch or assimilating thenables.
    void Promise.prototype.then.call(
      returned,
      () => undefined,
      () => undefined,
    );
  }
  throw new Error(message);
}
