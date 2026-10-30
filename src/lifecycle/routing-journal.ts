import {
  stateFrom,
  manifestRoutes,
  routePath,
  markerPath,
  digest,
  type State,
} from './manifest.js';
export const routingPath = '.arch/routing.json';
export const journalStage = '.arch/routing.stage';
export interface RoutingJournal {
  schema: 1;
  id: string;
  before: State;
  after: State;
  additions: Record<string, string>;
}
export function journalFrom(text: Buffer): RoutingJournal {
  // Preserve historical acceptance and metadata; parsing is separate from on-disk recovery validation.
  const value = readJournalHeader(text);
  const before = stateFrom(Buffer.from(JSON.stringify(value.before))),
    after = stateFrom(Buffer.from(JSON.stringify(value.after)));
  const oldRoutes = manifestRoutes(before),
    newRoutes = manifestRoutes(after);
  if (oldRoutes.windows !== newRoutes.windows || before.createdHarness !== after.createdHarness) {
    throw new Error('Invalid routing journal ownership');
  }
  for (const path of [routePath, markerPath]) {
    if (before.files[path] !== after.files[path]) {
      throw new Error('Invalid routing journal integration');
    }
  }
  validateJournalFiles(value, before, after);
  return { ...value, before, after };
}

interface JournalHeader {
  schema: 1;
  id: string;
  before?: unknown;
  after?: unknown;
  additions: Record<string, unknown>;
}

function readJournalHeader(text: Buffer): JournalHeader {
  const value: unknown = JSON.parse(text.toString());
  if (!isJournalHeader(value)) {
    throw new Error('Invalid routing journal');
  }
  return value;
}

function isJournalHeader(value: unknown): value is JournalHeader {
  if (
    null === value ||
    'object' !== typeof value ||
    !('schema' in value) ||
    1 !== value.schema ||
    !('id' in value) ||
    'string' !== typeof value.id ||
    !/^[a-f0-9-]{36}$/.test(value.id) ||
    !('additions' in value) ||
    !value.additions ||
    'object' !== typeof value.additions ||
    Array.isArray(value.additions)
  ) {
    return false;
  }
  return true;
}

function validateJournalFiles(
  value: JournalHeader,
  before: State,
  after: State,
): asserts value is JournalHeader & { additions: Record<string, string> } {
  for (const [path, hash] of Object.entries(after.files)) {
    if (before.files[path]) {
      if (hash !== before.files[path] || path in value.additions) {
        throw new Error('Invalid routing journal retained file');
      }
    } else {
      const payload = value.additions[path];
      if (
        'string' !== typeof payload ||
        Buffer.from(payload, 'base64').toString('base64') !== payload ||
        digest(Buffer.from(payload, 'base64')) !== hash
      ) {
        throw new Error('Invalid routing journal payload');
      }
    }
  }
  if (Object.keys(value.additions).some((path) => !after.files[path] || before.files[path])) {
    throw new Error('Invalid routing journal additions');
  }
}
