export const abi = 1;
export function createMiddleware({ id }) {
  return {
    id,
    register() {},
    registerPolicy(api) {
      api.on('agent.beforeSpawn', () => ({ action: 'deny', reason: 'external-policy' }));
    },
  };
}
