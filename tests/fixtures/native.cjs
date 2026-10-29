#!/usr/bin/env node
const fs = require('node:fs');
if ('1' === process.env.FAKE_IGNORE_TERM) {
  process.on('SIGTERM', () => {
    console.error('ignored SIGTERM');
  });
}
const record = {
  args: process.argv.slice(2),
  cwd: process.cwd(),
  demo: process.env.ARCH_DEMO || '',
  pid: process.pid,
};
if (process.env.FAKE_LOG) {
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(record) + '\n');
}
console.log(JSON.stringify(record));
console.error('native stderr');
if ('1' === process.env.FAKE_IGNORE_TERM) {
  console.error('native ready');
}
if ('1' === process.env.FAKE_STDIN) {
  process.stdin.pipe(process.stdout);
}
if ('1' === process.env.FAKE_WAIT) {
  setTimeout(() => {}, 60_000);
}
process.exitCode = Number(process.env.FAKE_EXIT || 0);
