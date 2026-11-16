export type MiddlewareSource = { readonly file: string } | { readonly package: string };

export interface MiddlewareDiagnostic {
  readonly middlewareId: string;
  readonly source: MiddlewareSource;
  readonly resolvedUrl?: string;
  readonly stage: 'resolve' | 'import' | 'contract' | 'factory';
  readonly code: 'resolution-error' | 'import-error' | 'module-contract' | 'factory-error';
  readonly disposition: 'skip' | 'failure';
}

/** Local metadata only: never includes options or raw module exceptions. */
export type MiddlewareDiagnosticReporter = (diagnostic: MiddlewareDiagnostic) => void;
