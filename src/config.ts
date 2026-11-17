import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import type { MiddlewareSource, OptionValue } from './middleware-contract.js';

export interface MiddlewareConfiguration {
  readonly id: string;
  readonly enabled: boolean;
  readonly source?: MiddlewareSource;
  readonly required?: boolean;
  readonly options?: Readonly<Record<string, OptionValue>>;
}

function isTable(value: unknown): value is Record<string, unknown> {
  return (
    null !== value &&
    'object' === typeof value &&
    (null === Object.getPrototypeOf(value) || Object.getPrototypeOf(value) === Object.prototype)
  );
}

function optionValue(value: unknown): OptionValue {
  if (null === value || 'string' === typeof value || 'boolean' === typeof value) {
    return value;
  }
  if ('number' === typeof value && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(optionValue));
  }
  if (isTable(value)) {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, optionValue(item)])),
    );
  }
  throw new Error('Middleware options must contain only JSON-compatible values');
}

function sourceValue(value: unknown): MiddlewareSource {
  if (!isTable(value) || 1 !== Object.keys(value).length) {
    throw new Error('Middleware source must contain exactly one file or package');
  }
  if ('string' === typeof value.file && value.file.length) {
    return Object.freeze({ file: value.file });
  }
  if ('string' === typeof value.package && value.package.length) {
    return Object.freeze({ package: value.package });
  }
  throw new Error('Middleware source must contain exactly one file or package');
}

/** Shared validation for TOML discovery and explicit trusted adapter configuration. */
export function validateMiddlewareEntries(entries: unknown): readonly MiddlewareConfiguration[] {
  if (!Array.isArray(entries)) {
    throw new Error('middleware must be an array of tables');
  }
  const seen = new Set<string>();
  return Object.freeze(
    entries.map((entry: unknown) => {
      if (
        !isTable(entry) ||
        'string' !== typeof entry.id ||
        !/^[a-z][a-z0-9-]*$/.test(entry.id) ||
        'boolean' !== typeof entry.enabled ||
        Object.keys(entry).some(
          (key) => !['id', 'enabled', 'source', 'required', 'options'].includes(key),
        ) ||
        seen.has(entry.id)
      ) {
        throw new Error('Each middleware needs a unique id and a boolean enabled field');
      }
      seen.add(entry.id);
      const identity = { id: entry.id, enabled: entry.enabled };
      if (!Object.hasOwn(entry, 'source')) {
        if (Object.hasOwn(entry, 'required') || Object.hasOwn(entry, 'options')) {
          throw new Error('External middleware fields require a source');
        }
        return Object.freeze(identity);
      }
      if (Object.hasOwn(entry, 'required') && 'boolean' !== typeof entry.required) {
        throw new Error('External middleware required must be boolean');
      }
      const options = Object.hasOwn(entry, 'options') ? entry.options : {};
      if (!isTable(options)) {
        throw new Error('Middleware options must be a table');
      }
      return Object.freeze({
        ...identity,
        source: sourceValue(entry.source),
        required: entry.required ?? true,
        options: optionValue(options) as Readonly<Record<string, OptionValue>>,
      });
    }),
  );
}

export interface Configuration {
  readonly projectRoot: string;
  /** Absolute selected configuration directory; parsed callers default to projectRoot/.arch. */
  readonly configurationDirectory?: string;
  readonly middleware: readonly MiddlewareConfiguration[];
}

export const configurationDirectories = Object.freeze([
  '.hcc',
  '.hcc-harness',
  '.arch',
  '.ai/.harness',
  '.ai/arch',
] as const);
export type ConfigurationDirectory = (typeof configurationDirectories)[number];

export function parseConfiguration(text: string, projectRoot: string): Configuration {
  const value = parse(text);
  if (1 !== value.schema || Object.keys(value).some((k) => !['schema', 'middleware'].includes(k))) {
    throw new Error('Expected schema = 1 and only schema/middleware fields');
  }
  const entries = value.middleware ?? [];
  const middleware = validateMiddlewareEntries(entries);
  return Object.freeze({ projectRoot, middleware: Object.freeze(middleware) });
}

/** Inspect one project root. Multiple candidates are a conflict, even with an explicit selection. */
export async function configurationAt(
  projectRoot: string,
  selected?: ConfigurationDirectory,
): Promise<Configuration | undefined> {
  if (undefined !== selected && !configurationDirectories.includes(selected)) {
    throw new Error('Invalid trusted configuration directory');
  }
  const found: { directory: string; text: string }[] = [];
  for (const candidate of configurationDirectories) {
    const directory = join(projectRoot, candidate);
    try {
      found.push({ directory, text: await readFile(join(directory, 'harness.toml'), 'utf8') });
    } catch (error) {
      if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
        throw error;
      }
    }
  }
  if (1 < found.length) {
    throw new Error(
      `Conflicting HCC configurations: ${found.map(({ directory }) => join(directory, 'harness.toml')).join(', ')}`,
    );
  }
  const candidate = found[0];
  if (!candidate) {
    return undefined;
  }
  if (undefined !== selected && candidate.directory !== join(projectRoot, selected)) {
    throw new Error(
      `Selected HCC configuration not found: ${join(projectRoot, selected, 'harness.toml')}`,
    );
  }
  try {
    return Object.freeze({
      ...parseConfiguration(candidate.text, projectRoot),
      configurationDirectory: candidate.directory,
    });
  } catch (error) {
    throw new Error(`Invalid Arch configuration: ${join(candidate.directory, 'harness.toml')}`, {
      cause: error,
    });
  }
}

export async function discoverConfiguration(
  cwd: string,
  selected?: ConfigurationDirectory,
): Promise<Configuration | undefined> {
  let directory = resolve(cwd);
  for (;;) {
    const configuration = await configurationAt(directory, selected);
    if (configuration) {
      return configuration;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      if (undefined !== selected) {
        throw new Error(`Selected HCC configuration not found: ${selected}/harness.toml`);
      }
      return undefined;
    }
    directory = parent;
  }
}
