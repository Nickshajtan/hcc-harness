/** JSON-compatible values; TOML date/time and nonfinite numbers are not accepted. */
export type OptionValue =
  | null
  | boolean
  | number
  | string
  | readonly OptionValue[]
  | { readonly [key: string]: OptionValue };

export interface MiddlewareFactoryInput {
  readonly id: string;
  readonly options: Readonly<Record<string, OptionValue>>;
}

export interface MiddlewareModule {
  readonly abi: 1;
  readonly createMiddleware: (
    input: MiddlewareFactoryInput,
  ) => import('./middleware.js').ArchMiddleware;
}

export type {
  MiddlewareSource,
  MiddlewareDiagnostic,
  MiddlewareDiagnosticReporter,
} from './middleware-diagnostics.js';
