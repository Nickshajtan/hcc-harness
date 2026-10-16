#!/usr/bin/env node
const fs = require('node:fs');
if (process.env.FAKE_IGNORE_TERM === '1') process.on('SIGTERM', () => { console.error('ignored SIGTERM'); });
const record = { args: process.argv.slice(2), cwd: process.cwd(), demo: process.env.ARCH_DEMO || '', pid: process.pid };
if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(record) + '\n');
console.log(JSON.stringify(record));
console.error('native stderr');
if (process.env.FAKE_IGNORE_TERM === '1') console.error('native ready');
if (process.env.FAKE_STDIN === '1') process.stdin.pipe(process.stdout);
if (process.env.FAKE_WAIT === '1') setTimeout(() => {}, 60_000);
process.exitCode = Number(process.env.FAKE_EXIT || 0);
