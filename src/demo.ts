import type { ArchMiddleware } from './middleware.js';

export function demo(): ArchMiddleware {
  return {
    id: 'demo',
    register(api) {
      api.cleanup(() => {
        if ('1' === process.env.ARCH_TRACE) {
          console.error('[arch:demo] cleanup');
        }
      });
      api.on('preflight', () => {
        if ('1' === process.env.ARCH_TRACE) {
          console.error('[arch:demo] preflight');
        }
        if ('1' === process.env.ARCH_DEMO_DENY) {
          throw new Error('Demo denied execution');
        }
      });
      api.on('prepareLaunch', () => {
        api.setEnv('ARCH_DEMO', '1');
      });
      api.on('finalize', () => {
        if ('1' === process.env.ARCH_TRACE) {
          console.error('[arch:demo] finalize');
        }
      });
    },
  };
}
