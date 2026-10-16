import { expect, it } from 'vitest';
import { EventBus } from '../../src/events.js';
import { createPipeline, type MiddlewareAPI } from '../../src/middleware.js';

async function prepare(handler: (api: MiddlewareAPI) => void) {
  const pipeline = createPipeline(Object.freeze({ executionId: 'id', projectRoot: '/', command: 'tool',
    originalArgs: [], cwd: '/', signal: new AbortController().signal }), new EventBus());
  pipeline.register({ id: 'test', register(api) {
    expect(() => api.setEnv('EARLY', 'value')).toThrow('prepareLaunch');
    api.on('prepareLaunch', () => { handler(api); });
    api.on('finalize', () => { expect(() => api.setEnv('LATE', 'value')).toThrow('prepareLaunch'); });
  } });
  try { await pipeline.run('prepareLaunch'); return pipeline.launchEnv(); }
  finally { await pipeline.run('finalize'); await pipeline.dispose(); }
}
it('allows identical values and independent variables', async () => {
  expect(await prepare(api => { api.setEnv('NAME', 'one'); api.setEnv('NAME', 'one'); api.setEnv('OTHER', 'two'); })).toEqual({ NAME: 'one', OTHER: 'two' });
});
it('rejects identical names with conflicting values', async () => {
  await expect(prepare(api => { api.setEnv('NAME', 'one'); api.setEnv('NAME', 'two'); })).rejects.toThrow('Conflicting');
});
it('uses platform-correct identity for differently cased equal values', async () => {
  const result = await prepare(api => { api.setEnv('NAME', 'one'); api.setEnv('name', 'one'); });
  expect(result).toEqual(process.platform === 'win32' ? { NAME: 'one' } : { NAME: 'one', name: 'one' });
});
it('uses platform-correct identity for differently cased conflicting values', async () => {
  const result = prepare(api => { api.setEnv('NAME', 'one'); api.setEnv('name', 'two'); });
  if (process.platform === 'win32') await expect(result).rejects.toThrow('Conflicting');
  else expect(await result).toEqual({ NAME: 'one', name: 'two' });
});
it('preserves invalid/reserved variable restrictions', async () => {
  await prepare(api => {
    for (const name of ['PATH', 'Path', 'PATHEXT', 'arch_active', 'NODE_OPTIONS', '', 'BAD=KEY']) expect(() => api.setEnv(name, 'value')).toThrow('Invalid');
    expect(() => api.setEnv('VALID', '\0')).toThrow('Invalid');
  });
});
it('keeps concurrent environment contributions isolated', async () => {
  expect(await Promise.all(['one', 'two'].map(value => prepare(api => { api.setEnv('NAME', value); })))).toEqual([{ NAME: 'one' }, { NAME: 'two' }]);
});
