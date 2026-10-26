export const DEAL_SHELL_MODULES = [
  { id: 'home', label: 'Home', exportKey: 'HOME', route: 'home' },
  { id: 'gssm', label: 'GSSM', exportKey: 'GSSM', route: 'gssm' },
  { id: 'isbd', label: 'ISBD', exportKey: 'ISBD', route: 'isbd' },
  { id: 'greenstar', label: 'Greenstar', exportKey: 'GREENSTAR', route: 'greenstar' },
  { id: 'documents', label: 'Documents', exportKey: 'DOCUMENTS', route: 'documents' },
  { id: 'metrics', label: 'Metrics', exportKey: 'METRICS', route: 'metrics' },
  { id: 'admin', label: 'Admin', exportKey: 'ADMIN', route: 'admin' },
]

export const DEFAULT_DEAL_SHELL_MODULE_ID = DEAL_SHELL_MODULES[0]?.id || 'home'

/**
 * Tab registries per module.
 * Each tab: { id, label, icon, badge(deal) → number|null }
 * Modules look up their tabs via MODULE_TAB_REGISTRIES[moduleId].
 * Components are NOT stored here — they live in the module's own lazy map.
 */
import { CalendarDays, CheckCircle2, DollarSign, GanttChart, Users, Contact } from 'lucide-react'

export const MODULE_TAB_REGISTRIES = {
  home: [
    { id: 'timeline',   label: 'Timeline',   icon: GanttChart,    badge: (d) => (d.timelines || []).length || null },
    { id: 'activities', label: 'Approvals',  icon: CheckCircle2,  badge: (d) => { const p = (d.activities || []).filter(a => a.status !== 'Completed' && a.status !== 'N/A').length; return p || null } },
    { id: 'financials', label: 'Financials', icon: DollarSign,    badge: null },
    { id: 'resources',  label: 'Resources',  icon: Users,         badge: null, placeholder: true },
    { id: 'calendar',   label: 'Calendar',   icon: CalendarDays,  badge: null },
    { id: 'contacts',   label: 'Contacts',   icon: Contact,       badge: (d) => (d.contacts || []).length || null },
  ],
}

export function emitDealShellSelection({ module, deal }) {
  const payload = {
    type: 'DEALSHELL_MODULE_SELECTED',
    timestamp: Date.now(),
    module: {
      id: module?.id || null,
      label: module?.label || null,
      exportKey: module?.exportKey || null,
      route: module?.route || null,
    },
    deal: deal
      ? {
          id: deal.id,
          clientName: deal.client_name || null,
          projectName: deal.project_name || null,
          opportunityNumber: deal.opportunity_number || null,
        }
      : null,
  }

  window.dispatchEvent(new CustomEvent('s0l:dealshell:module-selected', { detail: payload }))

  if (typeof window.s0lShellExport === 'function') {
    try {
      window.s0lShellExport(payload)
    } catch (error) {
      console.error('s0lShellExport failed:', error)
    }
  }

  return payload
}
