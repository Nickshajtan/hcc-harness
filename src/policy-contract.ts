export interface AgentBeforeSpawn {
  readonly type: 'agent.beforeSpawn';
  readonly requestId: string;
  /** Provider-supplied correlation, never an authorization credential. */
  readonly executionId?: string;
  readonly agentId?: string;
  readonly parentAgentId?: string;
  readonly provider: string;
  readonly requestedModel?: string;
  readonly agentType?: string;
}

export type PolicyDecision =
  { readonly action: 'allow' } | { readonly action: 'deny'; readonly reason: string };
export interface PolicyAPI {
  /** Deadline cancellation is cooperative; it does not terminate middleware JavaScript. */
  readonly signal?: AbortSignal;
  on(
    type: 'agent.beforeSpawn',
    handler: (request: AgentBeforeSpawn) => PolicyDecision | Promise<PolicyDecision>,
  ): void;
  cleanup(handler: () => void | Promise<void>): void;
}
export interface PolicyDenial {
  readonly middlewareId: string;
  readonly reason: string;
}
export interface PolicyFailure {
  readonly stage: 'configuration' | 'registration' | 'handler' | 'cleanup';
  readonly code:
    'configuration-error' | 'registration-contract' | 'invalid-decision' | 'exception' | 'timeout';
  readonly middlewareId: string;
  /** Local diagnostics only: adapters must not serialize raw exceptions. */
  readonly cause: unknown;
}
export interface PolicyDispatchOptions {
  /** Trusted local requirements for this event, never taken from request fields. */
  readonly requiredPolicies?: readonly string[];
  /** One total budget for registration, handlers and cleanup; default 5000 ms. */
  readonly timeoutMs?: number;
  /** Shared additional cleanup budget after deadline cancellation; default 100 ms. */
  readonly cleanupGraceMs?: number;
}
export type PolicyResult =
  | { readonly outcome: 'invalid-request' }
  | {
      readonly outcome: 'allow' | 'deny' | 'policy-error';
      readonly requestId: string;
      readonly denials: readonly PolicyDenial[];
      readonly failures: readonly PolicyFailure[];
    };
