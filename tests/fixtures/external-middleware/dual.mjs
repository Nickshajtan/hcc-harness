import { appendFileSync } from 'node:fs';
let instances = 0;
export const abi = 1;
export function createMiddleware({ id, options }) {
  const instance = ++instances;
  const record = (phase) => appendFileSync(options.log, `${phase}:${id}:${instance}\n`);
  return {
    id,
    register(api) {
      record('process');
      api.on('preflight', () => record('preflight'));
      api.on('finalize', () => record('finalize'));
      api.cleanup(() => record('cleanup'));
    },
    registerPolicy(api) {
      record('policy');
      api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
      api.cleanup(() => record('cleanup'));
    },
  };
}
