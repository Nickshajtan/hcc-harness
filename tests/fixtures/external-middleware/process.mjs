export const abi = 1;
export function createMiddleware({ id, options }) {
  return {
    id,
    register(api) {
      api.on('prepareLaunch', () => api.setEnv('HCC_EXTERNAL', String(options.value ?? 'loaded')));
    },
  };
}
