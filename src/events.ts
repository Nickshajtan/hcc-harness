import Emittery from 'emittery';
import { randomUUID } from 'node:crypto';

export interface EventPayloads {
  'execution.started': { readonly command: string; readonly projectRoot: string };
  'middleware.completed': { readonly middlewareId: string; readonly phase: string };
  'execution.completed': { readonly exitCode: number; readonly signal: string | null };
  'execution.failed': { readonly stage: string };
}
export type EventType = keyof EventPayloads;
export type ArchEvent<T extends EventType = EventType> = T extends EventType ? Readonly<{
  id: string; type: T; executionId: string; timestamp: string; schemaVersion: 1;
  payload: EventPayloads[T];
}> : never;
type EventMap = { [T in EventType]: ArchEvent<T> };

export class EventBus {
  private readonly emitter = new Emittery<EventMap>();
  constructor(private readonly reportError: (error: unknown) => void = () => {
    console.error('[arch] event subscriber failed');
  }) {}

  subscribe<T extends EventType>(type: T, handler: (event: ArchEvent<T>) => void | Promise<void>): () => void {
    return this.emitter.on(type, async ({ data }) => {
      try { await handler(data as ArchEvent<T>); }
      catch (error) {
        try { this.reportError(error); } catch { /* diagnostics cannot change execution */ }
      }
    });
  }

  async publish(event: ArchEvent): Promise<void> {
    Object.freeze(event.payload);
    Object.freeze(event);
    // The union is correlated at the public boundary; Emittery's generic loses that correlation.
    await this.emitter.emit(event.type, event as never);
  }

  dispose(): void { this.emitter.clearListeners(); }
  get listenerCount(): number { return this.emitter.listenerCount(); }
}

export function event<T extends EventType>(type: T, executionId: string, payload: EventPayloads[T]): ArchEvent<T> {
  return { id: randomUUID(), type, executionId, timestamp: new Date().toISOString(), schemaVersion: 1, payload } as ArchEvent<T>;
}
