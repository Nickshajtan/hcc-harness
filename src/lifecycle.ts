// Compatibility facade: lifecycle operations have one implementation owner.
export {
  setup,
  routingPath,
  manifestRoutes,
  planRoutes,
  reconcileRoutes,
  deinitialize,
  addRoutes,
  removeRoutes,
  configuredRoutes,
  inspectInstallation,
  type RoutingPlan,
  type LifecycleOptions,
  type InstallationStatus,
} from './lifecycle/index.js';
