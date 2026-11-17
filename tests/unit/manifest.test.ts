import { configurationDirectories } from '../../src/config.js';
import { projectLayout } from '../../src/project-layout.js';
import { expect, it } from 'vitest';
import { stateFrom, routePath } from '../../src/setup.js';

const hash = 'a'.repeat(64);
it.each([
  null,
  [],
  false,
  {},
  { files: null, createdHarness: false },
  { files: [], createdHarness: false },
  { files: {}, createdHarness: 'false' },
  { files: { '../user': hash }, createdHarness: false },
  { files: { '.arch/bin/..': hash }, createdHarness: false },
  { files: { '.arch/bin/tool': 1 }, createdHarness: false },
  { files: { '.arch/bin/tool': 'A'.repeat(64) }, createdHarness: false },
])('rejects unsafe or malformed ownership shape: %j', (value) => {
  expect(() => stateFrom(Buffer.from(JSON.stringify(value)))).toThrow('Invalid bootstrap state');
});

it('preserves valid historical incomplete ownership and additional metadata', () => {
  for (const files of [{}, { [routePath]: hash }, { '.arch/bin/tool': hash }]) {
    const value = { createdHarness: false, historical: 'retained', files };
    expect(stateFrom(Buffer.from(JSON.stringify(value)))).toEqual(value);
  }
});

it('retains syntax errors rather than reporting valid JSON as an ownership mismatch', () => {
  expect(() => stateFrom(Buffer.from('{'))).toThrow(SyntaxError);
});

it.each(configurationDirectories)('constrains ownership to the selected %s home', (directory) => {
  const layout = projectLayout('.', directory);
  for (const name of ['tool', 'tool.exe', 'tool.shim', '.arch-router']) {
    const files = { [routePath]: hash, [`${layout.binDirectory}/${name}`]: hash };
    expect(
      stateFrom(Buffer.from(JSON.stringify({ files, createdHarness: true })), layout).files,
    ).toEqual(files);
  }
  const other = '.arch' === directory ? '.hcc' : '.arch';
  for (const path of [
    `${other}/bin/tool`,
    `${layout.binDirectory}/..`,
    `${layout.binDirectory}/.`,
    `${layout.binDirectory}/nested/tool`,
    `${layout.binDirectory}/tool/`,
    `${layout.binDirectory}/tool\\extra`,
    `${directory}/modules/user.mjs`,
    `${directory}/harness.toml`,
  ]) {
    expect(() =>
      stateFrom(
        Buffer.from(JSON.stringify({ files: { [path]: hash }, createdHarness: true })),
        layout,
      ),
    ).toThrow('Invalid bootstrap');
  }
});
