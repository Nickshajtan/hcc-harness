/** Type-only authoring entrypoint: arch-harness/middleware. */
export type {
  ArchMiddleware,
  MiddlewareAPI,
  ExecutionContext,
  Phase,
  Registry,
} from './middleware.js';
export type { PolicyAPI, PolicyDecision, AgentBeforeSpawn } from './policy-contract.js';
export type {
  OptionValue,
  MiddlewareFactoryInput,
  MiddlewareModule,
  MiddlewareSource,
  MiddlewareDiagnostic,
  MiddlewareDiagnosticReporter,
} from './middleware-contract.js';
