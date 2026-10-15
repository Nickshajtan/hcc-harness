import type { ArchMiddleware } from './middleware.js';

export function demo(): ArchMiddleware {
  return { id: 'demo', register(api) {
    api.cleanup(() => { if (process.env.ARCH_TRACE === '1') console.error('[arch:demo] cleanup'); });
    api.on('preflight', () => {
      if (process.env.ARCH_TRACE === '1') console.error('[arch:demo] preflight');
      if (process.env.ARCH_DEMO_DENY === '1') throw new Error('Demo denied execution');
    });
    api.on('prepareLaunch', () => { api.setEnv('ARCH_DEMO', '1'); });
    api.on('finalize', () => { if (process.env.ARCH_TRACE === '1') console.error('[arch:demo] finalize'); });
  } };
}
