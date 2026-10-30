import { afterAll, beforeAll, expect, it } from 'vitest';
import { world, run, cli } from '../support.js';

let fixture: Awaited<ReturnType<typeof world>>;
beforeAll(async () => {
  fixture = await world();
});
afterAll(async () => {
  await fixture?.dispose();
});

it.each([
  [[], 'Unknown command'],
  [['unknown'], 'Unknown command'],
  [['--help', 'extra'], 'Unknown command'],
  [['init'], 'Use init <commands...> outside an interactive terminal'],
  [['configure'], 'Use configure <commands...> outside an interactive terminal'],
  [['init', '--yes'], 'Unknown option'],
  [['status', '--json', '--json'], 'Expected status [--json]'],
  [['route', 'list', 'extra'], 'Unknown route operation'],
  [['route', 'add'], 'Expected route list | route add/remove <commands...>'],
  [['route', 'remove', '--yes'], 'Expected route list | route add/remove <commands...>'],
  [['deinit'], 'Removal requires deinit --yes outside an interactive terminal'],
  [['uninstall', '--yes', '--yes'], 'Expected deinit/uninstall [--yes]'],
] satisfies [string[], string][])('rejects %j before mutation', async (args, message) => {
  const result = await run(process.execPath, [cli, ...args], fixture.C, fixture.env);
  expect(result, result.stderr).toMatchObject({ code: 2, signal: null, stdout: '' });
  expect(result.stderr).toContain(`[arch] ${message}\nArch project routing`);
  const status = await run(process.execPath, [cli, 'status', '--json'], fixture.C, fixture.env);
  const value: unknown = JSON.parse(status.stdout);
  expect(value).toMatchObject({ state: 'uninitialized', recoveryPending: false });
});

it('keeps run syntax errors distinct from management usage errors', async () => {
  const result = await run(process.execPath, [cli, 'run', 'tool'], fixture.C, fixture.env);
  expect(result).toMatchObject({
    code: 1,
    signal: null,
    stdout: '',
    stderr: '[arch] Usage: arch run <command> -- [args...]\n',
  });
});

it('prints help only to stdout and retains prompt-free legacy uninstall', async () => {
  const help = await run(process.execPath, [cli, '--help'], fixture.C, fixture.env);
  expect(help).toMatchObject({ code: 0, signal: null, stderr: '' });
  expect(help.stdout).toContain('Installation does not verify activation in the current shell.');
  const removed = await run(process.execPath, [cli, 'uninstall'], fixture.C, fixture.env);
  expect(removed).toMatchObject({ code: 0, signal: null });
  expect(removed.stderr).toBe(
    '[arch] uninstall is deprecated; use deinit --yes for unattended removal.\n',
  );
  expect(removed.stdout).toBe(
    'Arch project routing removed. Refresh the shell prompt to refresh command resolution.\n',
  );
});
