import { expect, it } from 'vitest';
import {
  digest,
  manifestRoutes,
  routePath,
  markerPath,
  stateFrom,
  equal,
  encode,
  validateCommands,
  type State,
  key,
  configText,
} from '../../src/lifecycle/manifest.js';
import { journalFrom, type RoutingJournal } from '../../src/lifecycle/routing-journal.js';

const hash = digest('retained');
function journal(windows = false): RoutingJournal {
  const paths = (name: string) =>
    windows ? [`.arch/bin/${name}.exe`, `.arch/bin/${name}.shim`] : [`.arch/bin/${name}`];
  const integration = { [routePath]: hash, [markerPath]: hash };
  const before: State = {
    files: {
      ...integration,
      ...Object.fromEntries(
        [...paths('retained'), ...paths('removed')].map((path) => [path, hash]),
      ),
    },
    createdHarness: true,
  };
  const additions = Object.fromEntries(
    paths('added').map((path) => [path, Buffer.from('new launcher').toString('base64')]),
  );
  const after: State = {
    files: {
      ...integration,
      ...Object.fromEntries(paths('retained').map((path) => [path, hash])),
      ...Object.fromEntries(paths('added').map((path) => [path, digest('new launcher')])),
    },
    createdHarness: true,
  };
  return { schema: 1, id: '12345678-1234-1234-1234-123456789abc', before, after, additions };
}
const parse = (value: unknown) => journalFrom(Buffer.from(JSON.stringify(value)));

it.each([false, true])(
  'preserves valid journal bytes, layout and unknown metadata (Windows=%s)',
  (windows) => {
    const value = { ...journal(windows), historical: { runtime: '/removed/node' } };
    expect(parse(value)).toEqual(value);
    expect(manifestRoutes(value.after)).toEqual({ commands: ['retained', 'added'], windows });
  },
);
it.each([
  null,
  false,
  [],
  {},
  { ...journal(), schema: 2 },
  { ...journal(), id: 1 },
  { ...journal(), id: 'invalid' },
  { ...journal(), id: 'x12345678-1234-1234-1234-123456789abc' },
  { ...journal(), id: '12345678-1234-1234-1234-123456789abcx' },
  { ...journal(), additions: null },
  { ...journal(), additions: [] },
  { ...journal(), additions: 'payload' },
])('rejects malformed journal shape %j', (value) => {
  expect(() => parse(value)).toThrow('Invalid routing journal');
});

const invalid: { name: string; change: (value: RoutingJournal) => void; message: string }[] = [
  {
    name: 'ownership',
    change(value) {
      value.after.createdHarness = false;
    },
    message: 'ownership',
  },
  {
    name: 'platform layout',
    change(value) {
      value.after = journal(true).after;
    },
    message: 'ownership',
  },
  {
    name: 'mise digest',
    change(value) {
      value.after.files[routePath] = digest('other');
    },
    message: 'integration',
  },
  {
    name: 'marker digest',
    change(value) {
      value.after.files[markerPath] = digest('other');
    },
    message: 'integration',
  },
  {
    name: 'retained digest',
    change(value) {
      value.after.files['.arch/bin/retained'] = digest('other');
    },
    message: 'retained file',
  },
  {
    name: 'retained addition',
    change(value) {
      value.additions['.arch/bin/retained'] = Buffer.from('retained').toString('base64');
    },
    message: 'retained file',
  },
  {
    name: 'missing payload',
    change(value) {
      value.additions = {};
    },
    message: 'payload',
  },
  {
    name: 'noncanonical base64',
    change(value) {
      value.additions['.arch/bin/added'] = 'bmV3IGxhdW5jaGVy\n';
    },
    message: 'payload',
  },
  {
    name: 'payload hash',
    change(value) {
      value.additions['.arch/bin/added'] = Buffer.from('other').toString('base64');
    },
    message: 'payload',
  },
  {
    name: 'unrecorded addition',
    change(value) {
      value.additions['.arch/bin/foreign'] = '';
    },
    message: 'additions',
  },
];
it.each(invalid)('rejects changed $name', ({ change, message }) => {
  const value = journal();
  change(value);
  expect(() => parse(value)).toThrow(`Invalid routing journal ${message}`);
});
it('keeps syntax errors and invalid nested ownership explicit', () => {
  expect(() => journalFrom(Buffer.from('{'))).toThrow(SyntaxError);
  expect(() => parse({ ...journal(), before: null })).toThrow('Invalid bootstrap state');
  expect(() =>
    parse({ ...journal(), after: { files: { '../foreign': hash }, createdHarness: true } }),
  ).toThrow('Invalid bootstrap state');
});
it.each([
  '.arch/bin/.',
  '.arch/bin/..',
  '.arch/bin/a/b',
  '.arch\\bin\\tool',
  '/.arch/bin/tool',
  '.arch/bin/tool\0',
  '.arch/bin/tool/',
])('rejects unsafe recorded path %j', (path) => {
  expect(() =>
    stateFrom(Buffer.from(JSON.stringify({ files: { [path]: hash }, createdHarness: false }))),
  ).toThrow('Invalid bootstrap state');
});
it('distinguishes parseable ownership from complete routing layouts', () => {
  const incomplete = { files: { [routePath]: hash }, createdHarness: false };
  expect(stateFrom(Buffer.from(JSON.stringify(incomplete)))).toEqual(incomplete);
  expect(() => manifestRoutes(incomplete)).toThrow('missing mise integration or router marker');
  const windows = journal(true).after;
  const { ['.arch/bin/added.shim']: missing, ...files } = windows.files;
  expect(missing).toBeDefined();
  expect(() => manifestRoutes({ ...windows, files })).toThrow('missing exe/shim pair');
  expect(() =>
    manifestRoutes({
      ...windows,
      files: { ...windows.files, '.arch/bin/ADDED.exe': hash, '.arch/bin/ADDED.shim': hash },
    }),
  ).toThrow('unique executable names');
});
it('compares ownership independently of property order and preserves encoding', () => {
  const state = journal().before;
  expect(
    equal(state, { ...state, files: Object.fromEntries(Object.entries(state.files).reverse()) }),
  ).toBe(true);
  expect(equal(state, { ...state, createdHarness: false })).toBe(false);
  expect(equal(state, { ...state, files: {} })).toBe(false);
  expect(encode(state)).toBe(JSON.stringify(state, null, 2) + '\n');
  expect(digest('retained')).toBe(digest(Buffer.from('retained')));
});
it.each([[], ['node'], ['MISE'], ['arch'], ['bad.name'], ['a', 'a']])(
  'rejects invalid commands %j',
  (...commands) => {
    expect(() => {
      validateCommands(commands);
    }).toThrow('Supply unique executable names');
  },
);
it('uses installation-specific command identity', () => {
  expect(() => {
    validateCommands(['Tool', 'tool'], true);
  }).toThrow('unique');
  expect(() => {
    validateCommands(['Tool', 'tool'], false);
  }).not.toThrow();
  expect(() => {
    validateCommands(['Tool_2-valid'], true);
  }).not.toThrow();
  expect(key('Tool')).toBe('win32' === process.platform ? 'tool' : 'Tool');
  if ('win32' === process.platform) {
    expect(() => {
      validateCommands(['Tool', 'tool']);
    }).toThrow('unique');
  } else {
    expect(() => {
      validateCommands(['Tool', 'tool']);
    }).not.toThrow();
  }
});

it.each([`x${hash}`, `${hash}x`, 1111111111111111, null])(
  'rejects invalid ownership digests %j',
  (value) => {
    expect(() =>
      stateFrom(
        Buffer.from(JSON.stringify({ files: { '.arch/bin/tool': value }, createdHarness: true })),
      ),
    ).toThrow('Invalid bootstrap state');
  },
);
it('rejects non-object files and mixed invalid command sets', () => {
  expect(() => stateFrom(Buffer.from('{"files":"","createdHarness":true}'))).toThrow(
    'Invalid bootstrap state',
  );
  expect(() => {
    validateCommands(['valid', 'node']);
  }).toThrow('reserved');
});
it('rejects mixed launcher layouts and mismatched Windows pairs', () => {
  const value = journal(true).after;
  expect(() =>
    manifestRoutes({ ...value, files: { ...value.files, '.arch/bin/posix': hash } }),
  ).toThrow('invalid launcher set');
  const { ['.arch/bin/added.shim']: removed, ...files } = value.files;
  expect(removed).toBeDefined();
  expect(() =>
    manifestRoutes({ ...value, files: { ...files, '.arch/bin/unpaired.shim': hash } }),
  ).toThrow('missing exe/shim pair');
});
it('retains the generated starter configuration bytes', () => {
  expect(configText).toBe('schema = 1\n\n[[middleware]]\nid = "demo"\nenabled = true\n');
});
