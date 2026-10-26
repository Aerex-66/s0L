import { lazy } from 'react'

/**
 * Shell module registry.
 * Each entry maps a deal-shell module id to a lazy-loaded component.
 * To add a new module: create its feature folder, add one entry here.
 */
export const MODULE_REGISTRY = {
  home:      lazy(() => import('../features/home/HomeModule')),
  isbd:      lazy(() => import('../features/isbd/IsbdModule')),
  gssm:      lazy(() => import('../features/gssm/GssmModule')),
  greenstar: lazy(() => import('../features/greenstar/GreenstarModule')),
  documents: lazy(() => import('../features/documents/DocumentsModule')),
  metrics:   lazy(() => import('../features/metrics/MetricsModule')),
  admin:     lazy(() => import('../features/admin/AdminModule')),
}
