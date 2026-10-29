import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverConfiguration, parseConfiguration } from '../../src/config.js';

describe('configuration', () => {
  it('validates schema, fields, booleans, unique ids, and TOML', () => {
    expect(parseConfiguration('schema = 1', '/p').middleware).toEqual([]);
    expect(
      parseConfiguration('schema=1\n[[middleware]]\nid="demo"\nenabled=false', '/p').middleware,
    ).toEqual([{ id: 'demo', enabled: false }]);
    for (const text of [
      'schema=2',
      'schema="1"',
      'schema=1\nextra=2',
      'schema=1\nmiddleware="demo"',
      'schema=1\n[[middleware]]\nid="demo"',
      'schema=1\n[[middleware]]\nid="demo"\nenabled="true"',
      'schema=1\n[[middleware]]\nid="demo"\nenabled=true\nextra=1',
      'schema=1\n[[middleware]]\nid="demo"\nenabled=true\n[[middleware]]\nid="demo"\nenabled=false',
      'schema = [',
    ]) {
      expect(() => parseConfiguration(text, '/p'), text).toThrow();
    }
  });
  it('discovers ancestors, selects the nearest nested config, and fails closed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arch-config-'));
    try {
      const a = join(root, 'A'),
        nested = join(a, 'nested'),
        sub = join(nested, 'sub');
      await mkdir(join(a, '.arch'), { recursive: true });
      await mkdir(join(nested, '.arch'), { recursive: true });
      await mkdir(sub);
      await writeFile(join(a, '.arch/harness.toml'), 'schema=1');
      expect((await discoverConfiguration(sub))?.projectRoot).toBe(a);
      await writeFile(join(nested, '.arch/harness.toml'), 'schema=1');
      expect((await discoverConfiguration(sub))?.projectRoot).toBe(nested);
      await writeFile(join(nested, '.arch/harness.toml'), 'schema=99');
      await expect(discoverConfiguration(sub)).rejects.toThrow('Invalid Arch configuration');
      expect(await discoverConfiguration(root)).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
