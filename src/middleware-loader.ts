import { isPromise } from 'node:util/types';
import {
  validateMiddlewareEntries,
  type Configuration,
  type MiddlewareConfiguration,
} from './config.js';
import type { ArchMiddleware, Registry } from './middleware.js';
import type {
  MiddlewareDiagnostic,
  MiddlewareDiagnosticReporter,
  MiddlewareModule,
  MiddlewareSource,
} from './middleware-contract.js';
import { assertMiddlewareProjectRoot, resolveMiddlewareSource } from './middleware-resolution.js';

/** Default local path, also used by CLI. No options, request contents or exceptions are printed. */
export function reportMiddlewareDiagnostic(diagnostic: MiddlewareDiagnostic): void {
  console.error('[arch:middleware]', JSON.stringify(diagnostic));
}

export class MiddlewareLoadError extends Error {
  constructor(
    readonly diagnostic: MiddlewareDiagnostic,
    cause: unknown,
  ) {
    super(`External middleware ${diagnostic.middlewareId}: ${diagnostic.code}`, { cause });
  }
}

function diagnosticFor(
  id: string,
  source: MiddlewareSource,
  stage: MiddlewareDiagnostic['stage'],
  required: boolean,
  resolvedUrl?: string,
): MiddlewareDiagnostic {
  const codes = {
    resolve: 'resolution-error',
    import: 'import-error',
    contract: 'module-contract',
    factory: 'factory-error',
  } as const;
  return Object.freeze({
    middlewareId: id,
    source,
    stage,
    code: codes[stage],
    disposition: required ? 'failure' : 'skip',
    ...(resolvedUrl ? { resolvedUrl } : {}),
  });
}

function validateModule(value: unknown): MiddlewareModule {
  if (
    !value ||
    'object' !== typeof value ||
    !('abi' in value) ||
    1 !== value.abi ||
    !('createMiddleware' in value) ||
    'function' !== typeof value.createMiddleware
  ) {
    throw new Error('Expected named abi = 1 and createMiddleware exports');
  }
  return value as MiddlewareModule;
}

function validateInstance(value: unknown, id: string): ArchMiddleware {
  if (isPromise(value)) {
    // Observe actual rejected Promises without assimilating arbitrary thenables.
    void Promise.prototype.then.call(
      value,
      () => undefined,
      () => undefined,
    );
    throw new Error('Middleware factory must return synchronously');
  }
  if (
    !value ||
    'object' !== typeof value ||
    'then' in value ||
    !('id' in value) ||
    id !== value.id ||
    !('register' in value) ||
    'function' !== typeof value.register ||
    ('registerPolicy' in value &&
      undefined !== value.registerPolicy &&
      'function' !== typeof value.registerPolicy)
  ) {
    throw new Error('Invalid middleware instance or configured id mismatch');
  }
  return value as ArchMiddleware;
}

/** Prepare ordinary zero-argument factories. Pipelines retain instance/registration/cleanup ownership. */
export async function loadMiddleware(
  configuration: Pick<Configuration, 'middleware'> & Partial<Pick<Configuration, 'projectRoot'>>,
  baseRegistry: Registry,
  report: MiddlewareDiagnosticReporter = reportMiddlewareDiagnostic,
) {
  const entries = validateMiddlewareEntries(configuration.middleware);
  const registry = new Map(baseRegistry);
  for (const entry of entries) {
    if (entry.source && registry.has(entry.id)) {
      throw new Error(`External middleware registry collision: ${entry.id}`);
    }
  }
  const projectRoot = configuration.projectRoot ?? '';
  if (entries.some((entry) => entry.enabled && entry.source)) {
    // A missing/invalid trusted context is global configuration failure, never an optional skip.
    assertMiddlewareProjectRoot(projectRoot);
  }
  const effective: MiddlewareConfiguration[] = [];
  const diagnostics: MiddlewareDiagnostic[] = [];
  const publish = (diagnostic: MiddlewareDiagnostic) => {
    diagnostics.push(diagnostic);
    report(diagnostic);
  };
  for (const entry of entries) {
    if (!entry.enabled || !entry.source) {
      effective.push(entry);
      continue;
    }
    let stage: MiddlewareDiagnostic['stage'] = 'resolve';
    let url: string | undefined;
    let module: MiddlewareModule;
    try {
      url = await resolveMiddlewareSource(entry.source, projectRoot);
      stage = 'import';
      const namespace: unknown = await import(url);
      stage = 'contract';
      module = validateModule(namespace);
    } catch (cause) {
      const diagnostic = diagnosticFor(
        entry.id,
        entry.source,
        stage,
        false !== entry.required,
        url,
      );
      publish(diagnostic);
      if (false !== entry.required) {
        throw new MiddlewareLoadError(diagnostic, cause);
      }
      continue;
    }
    const source = entry.source;
    const resolvedUrl = url;
    registry.set(entry.id, () => {
      try {
        return validateInstance(
          module.createMiddleware(
            Object.freeze({ id: entry.id, options: entry.options ?? Object.freeze({}) }),
          ),
          entry.id,
        );
      } catch (cause) {
        const diagnostic = diagnosticFor(
          entry.id,
          source,
          'factory',
          false !== entry.required,
          resolvedUrl,
        );
        publish(diagnostic);
        throw new MiddlewareLoadError(diagnostic, cause);
      }
    });
    effective.push(entry);
  }
  return {
    registry,
    configuration: Object.freeze({ ...configuration, middleware: Object.freeze(effective) }),
    diagnostics,
  };
}

/** Optionality ends here, before either pipeline begins registration. */
export function instantiateMiddleware(
  entry: MiddlewareConfiguration,
  registry: Registry,
): ArchMiddleware | undefined {
  const factory = registry.get(entry.id);
  if (!factory) {
    throw new Error(`Unknown middleware: ${entry.id}`);
  }
  let middleware: ArchMiddleware;
  try {
    middleware = factory();
  } catch (error) {
    if (
      entry.source &&
      false === entry.required &&
      error instanceof MiddlewareLoadError &&
      'skip' === error.diagnostic.disposition
    ) {
      return undefined;
    }
    throw error;
  }
  if (middleware.id !== entry.id) {
    throw new Error(`Middleware registration id mismatch: ${entry.id}`);
  }
  return middleware;
}
