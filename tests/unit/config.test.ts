import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverConfiguration, parseConfiguration } from '../../src/config.js';

describe('configuration', () => {
  it('rejects malformed middleware identities and preserves diagnostic contracts', () => {
    for (const id of ['Demo', '1demo', ' demo', 'demo!', '', 'demo\n']) {
      const text = `schema=1\n[[middleware]]\nid=${JSON.stringify(id)}\nenabled=true`;
      expect(() => parseConfiguration(text, '/p')).toThrow(
        'Each middleware needs a unique id and a boolean enabled field',
      );
    }
    for (const entry of [
      '1',
      '"demo"',
      '[]',
      '{enabled=true}',
      '{id=1,enabled=true}',
      '{id=true,enabled=true}',
      '{id=["demo"],enabled=true}',
    ]) {
      expect(() => parseConfiguration(`schema=1\nmiddleware=[${entry}]`, '/p')).toThrow(
        'Each middleware needs a unique id and a boolean enabled field',
      );
    }
    expect(() => parseConfiguration('schema=2', '/p')).toThrow(
      'Expected schema = 1 and only schema/middleware fields',
    );
    expect(() => parseConfiguration('schema=1\nmiddleware="demo"', '/p')).toThrow(
      'middleware must be an array of tables',
    );
    const result = parseConfiguration('schema=1\n[[middleware]]\nid="demo"\nenabled=true', '/p');
    expect(result).toEqual({ projectRoot: '/p', middleware: [{ id: 'demo', enabled: true }] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.middleware)).toBe(true);
    expect(Object.isFrozen(result.middleware[0])).toBe(true);
  });

  it('preserves a configuration parse failure as the cause of its contextual error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arch-config-error-'));
    try {
      await mkdir(join(root, '.arch'));
      await writeFile(join(root, '.arch/harness.toml'), 'schema=2');
      let failure: unknown;
      try {
        await discoverConfiguration(root);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error)) {
        throw new Error('Expected contextual configuration error');
      }
      expect(failure.message).toContain(join(root, '.arch', 'harness.toml'));
      const cause = failure.cause;
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) {
        throw new Error('Expected original configuration parse failure');
      }
      expect(cause.message).toBe('Expected schema = 1 and only schema/middleware fields');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('propagates filesystem read failures instead of treating them as missing configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arch-config-io-'));
    try {
      await mkdir(join(root, '.arch/harness.toml'), { recursive: true });
      await expect(discoverConfiguration(root)).rejects.toMatchObject({ code: expect.any(String) });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
