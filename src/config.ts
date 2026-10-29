import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'smol-toml';

export interface Configuration {
  readonly projectRoot: string;
  readonly middleware: readonly { readonly id: string; readonly enabled: boolean }[];
}

export function parseConfiguration(text: string, projectRoot: string): Configuration {
  const value = parse(text);
  if (1 !== value.schema || Object.keys(value).some((k) => !['schema', 'middleware'].includes(k))) {
    throw new Error('Expected schema = 1 and only schema/middleware fields');
  }
  const entries = value.middleware ?? [];
  if (!Array.isArray(entries)) {
    throw new Error('middleware must be an array of tables');
  }
  const seen = new Set<string>();
  const middleware = entries.map((entry) => {
    if (
      !entry ||
      'object' !== typeof entry ||
      Array.isArray(entry) ||
      !('id' in entry) ||
      'string' !== typeof entry.id ||
      !/^[a-z][a-z0-9-]*$/.test(entry.id) ||
      !('enabled' in entry) ||
      'boolean' !== typeof entry.enabled ||
      Object.keys(entry).some((k) => !['id', 'enabled'].includes(k)) ||
      seen.has(entry.id)
    ) {
      throw new Error('Each middleware needs a unique id and a boolean enabled field');
    }
    seen.add(entry.id);
    return Object.freeze({ id: entry.id, enabled: entry.enabled });
  });
  return Object.freeze({ projectRoot, middleware: Object.freeze(middleware) });
}

export async function discoverConfiguration(cwd: string): Promise<Configuration | undefined> {
  let directory = resolve(cwd);
  for (;;) {
    const file = join(directory, '.arch', 'harness.toml');
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
        throw error;
      }
      const parent = dirname(directory);
      if (parent === directory) {
        return undefined;
      }
      directory = parent;
      continue;
    }
    try {
      return parseConfiguration(text, directory);
    } catch (error) {
      throw new Error(`Invalid Arch configuration: ${file}`, { cause: error });
    }
  }
}
