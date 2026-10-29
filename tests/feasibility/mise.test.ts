import { expect, it } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';
import { world, run, mise } from '../support.js';

it('records mise wrapper feasibility using plain CLI names versus mise exec', async () => {
  const fixture = await world();
  try {
    const observer = join(fixture.root, 'observer.cjs');
    await writeFile(
      observer,
      `console.error('prototype-wrapper:' + process.env.PROJECT_LABEL); const r = require('node:child_process').spawnSync('claude', process.argv.slice(2), {stdio:'inherit', shell:false}); process.exit(r.status ?? 1);\n`,
    );
    const quote = (text: string) => JSON.stringify(text.replaceAll('\\', '/'));
    for (const [directory, label] of [
      [fixture.A, 'A'],
      [fixture.B, 'B'],
    ] as const) {
      await writeFile(
        join(directory, 'mise.toml'),
        `[wrappers.claude]\ncommand=${quote(process.execPath)}\nargs=[${quote(observer)}]\nenv={PROJECT_LABEL="${label}"}\n`,
      );
    }
    const env = {
      ...fixture.env,
      PATH: [
        join(fixture.root, 'data/command-wrappers/bin'),
        join(fixture.root, 'data/shims'),
        fixture.env.PATH,
      ].join(delimiter),
    };
    for (const directory of [fixture.A, fixture.B]) {
      const result = await run(mise, ['reshim'], directory, env);
      expect(result, result.stderr).toMatchObject({ code: 0 });
    }
    const args = ['--flag', '', 'two words', 'a"b', '&|<>^%!', 'tail\\'];
    const evidence: Record<string, unknown> = {
      version: (await run(mise, ['--version'], fixture.root, env)).stdout.trim(),
      platform: process.platform,
    };
    for (const [name, directory] of [
      ['A', fixture.A],
      ['B', fixture.B],
      ['C', fixture.C],
      ['outside', fixture.root],
      ['returnA', fixture.A],
    ] as const) {
      const direct = await run('claude', args, directory, env);
      const viaExec = await run(mise, ['exec', '--', 'claude', ...args], directory, env);
      expect(viaExec, viaExec.stderr).toMatchObject({ code: 0 });
      expect(JSON.parse(viaExec.stdout.trim())).toMatchObject({ args, cwd: directory });
      if ('A' === name || 'B' === name || 'returnA' === name) {
        expect(direct, direct.stderr).toMatchObject({ code: 0 });
        expect(direct.stderr).toContain('prototype-wrapper:' + ('B' === name ? 'B' : 'A'));
        expect(JSON.parse(direct.stdout.trim())).toMatchObject({ args, cwd: directory });
      }
      evidence[name] = { plainCommand: direct, miseExec: viaExec };
    }
    await mkdir(resolve('.test-state'), { recursive: true });
    await writeFile(
      resolve(`.test-state/mise-${process.platform}.json`),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  } finally {
    await fixture.dispose();
  }
});
