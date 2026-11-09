import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { release } from 'node:os';
import { basename, resolve, join } from 'node:path';
import { spawn } from './windows-pty.mjs';
import { promisify } from 'node:util';

const execute = promisify(execFile);

if ('win32' !== process.platform) {
  console.log('SKIP Windows ConPTY cleanup regression (requires Windows)');
} else {
  await mkdir('.test-state', { recursive: true });
  const root = await mkdtemp(resolve('.test-state/pty-cleanup-'));
  const results = [];
  let passed = false;
  try {
    async function check(label, file, args, expected, input) {
      const terminal = spawn(file, args, {
        cwd: root,
        env: { ...process.env, ARCH_NODE: process.execPath },
        cols: 100,
        rows: 25,
      });
      let output = '',
        sent = false;
      terminal.onData((chunk) => {
        output = (output + chunk).slice(-65536);
        if (input && !sent && output.includes('READY')) {
          sent = true;
          terminal.write(input);
        }
      });
      try {
        const result = await terminal.settled;
        assert.equal(result.exitCode, expected, output);
        assert.match(output, /READY/);
        assert.match(output, '\x03' === input ? /INTERRUPTED/ : /RECEIVED:hello/);
        const intended = '\x03' === input ? process.execPath : process.env.ComSpec;
        assert.ok(
          result.evidence.processes.some(
            (entry) => entry.ExecutablePath?.toLowerCase() === intended.toLowerCase(),
          ),
          'Intended native executable must be observed while alive',
        );
        results.push({ label, result, output });
      } catch (error) {
        results.push({ label, error: String(error), output });
        throw error;
      }
    }
    const shell = process.env.ComSpec;
    for (const code of [0, 7]) {
      await check(
        `native exit ${code}`,
        shell,
        [
          '/d',
          '/v:on',
          '/c',
          `echo READY & set /p value= & echo RECEIVED:!value! & exit /b ${code}`,
        ],
        code,
        'hello\r',
      );
    }
    const invalid = spawn(join(root, 'missing.exe'), [], { cwd: root, env: process.env });
    await assert.rejects(invalid.settled, (error) => {
      assert.match(error.message, /CreateProcess|File not found|cannot find/i);
      assert.deepEqual(error.evidence.residual, []);
      assert.equal(error.evidence.status.code, 0);
      results.push({ label: 'initialization failure', evidence: error.evidence });
      return true;
    });
    // A deterministic Ctrl+C fixture reports the signal before leaving. Native
    // Node is an explicit executable fixture, independent of Arch/authentication.
    const fixture = join(root, 'interrupt.cjs');
    await writeFile(
      fixture,
      "process.on('SIGINT',()=>{console.log('INTERRUPTED');process.exit(130)});console.log('READY');process.stdin.resume();\n",
    );
    await check('native Ctrl+C', process.execPath, [fixture], 130, '\x03');
    const waiting = spawn(shell, ['/d', '/c', 'echo READY & set /p value='], {
      cwd: root,
      env: process.env,
    });
    let cancelled = false;
    waiting.onData((chunk) => {
      if (!cancelled && chunk.includes('READY')) {
        cancelled = true;
        waiting.kill();
      }
    });
    const interrupted = await waiting.settled;
    assert.ok(interrupted.evidence.result.event, 'Interrupted PTY must notify exit');
    results.push({ label: 'controlled cancellation (public kill)', result: interrupted });
    // Negative controls exercise the parent's real subprocess protocol. Neither
    // is a successful PTY lifecycle; deadline termination is failure recovery.
    const faultyDriver = join(root, 'faulty-driver.mjs');
    await writeFile(
      faultyDriver,
      "process.on('message',m=>{if(m.type==='start'){process.send({type:'spawned',pid:process.pid});process.send({type:'data',data:'READY'});}else if(m.type==='write'){process.exit(0);}});\n",
    );
    for (const mode of ['premature exit', 'hang']) {
      const faulty = spawn(shell, [], { cwd: root, env: process.env }, faultyDriver);
      faulty.onData(() => {
        if ('premature exit' === mode) {
          faulty.write('exit');
        }
      });
      await assert.rejects(faulty.settled, (error) => {
        assert.match(error.message, 'hang' === mode ? /deadline exceeded/ : /before reporting/);
        assert.deepEqual(error.evidence.residual, []);
        results.push({ label: `detected driver ${mode}`, evidence: error.evidence });
        return true;
      });
    }
    if (process.env.ARCH_PTY_STABLE_ENTRY) {
      const entry = resolve(process.env.ARCH_PTY_STABLE_ENTRY);
      const management = {
        cwd: root,
        env: { ...process.env, ARCH_NODE: process.execPath },
        windowsHide: true,
        timeout: 15000,
      };
      await execute(entry, ['init', 'cmd'], management);
      await writeFile(join(root, '.arch/harness.toml'), 'schema=1\nmiddleware=[]\n');
      for (const code of [0, 7]) {
        await check(
          `stable Arch exit ${code}`,
          join(root, '.arch/bin/cmd.exe'),
          [
            '/d',
            '/v:on',
            '/c',
            `echo READY & set /p value= & echo RECEIVED:!value! & exit /b ${code}`,
          ],
          code,
          'hello\r',
        );
      }
      await check(
        'stable Arch Ctrl+C',
        entry,
        ['run', basename(process.execPath), '--', fixture],
        130,
        '\x03',
      );
      await execute(entry, ['deinit', '--yes'], management);
      results.push({ label: 'stable project deinit', status: 'PASS' });
    } else {
      results.push({
        label: 'stable Arch',
        status: 'NOT TESTED',
        reason: 'Set ARCH_PTY_STABLE_ENTRY to isolated stable arch.exe',
      });
    }
    await rm(root, { recursive: true });
    passed = true;
  } catch (error) {
    results.push({ label: 'suite failure', error: error.stack ?? String(error) });
    throw error;
  } finally {
    if (!passed) {
      await writeFile(join(root, 'results.json'), JSON.stringify({ passed, results }, null, 2));
    }
    await writeFile(
      '.test-state/windows-pty-cleanup.json',
      JSON.stringify(
        {
          passed,
          windows: release(),
          node: process.version,
          scratch: root,
          results,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ passed, evidence: root, results }, null, 2));
    if (passed) {
      console.log('PASS scratch files removed');
    }
  }
}
