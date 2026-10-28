import {
  SapPracticeIcon, OraclePracticeIcon, CrmPracticeIcon, HcmPracticeIcon, SupplyChainPracticeIcon, OtherPracticeIcon,
} from '../../shared/ui/Icons'

// Vendor logos are bundled files: drop <vendor>.svg (or .png/.webp) into src/assets/practice-logos and it shows up.
const LOGO_FILES = import.meta.glob('../../assets/practice-logos/*.{svg,png,webp}', { eager: true, query: '?url', import: 'default' })
const LOGOS = Object.fromEntries(
  Object.entries(LOGO_FILES).map(([path, url]) => [path.split('/').pop().replace(/\.(svg|png|webp)$/, ''), url]),
)

const VENDORS = {
  sap: { name: 'SAP' },
  oracle: { name: 'Oracle' },
  salesforce: { name: 'Salesforce', match: /salesforce|sfdc|service cloud|sales cloud|marketing cloud|mulesoft|tableau|agentforce/i },
  adobe: { name: 'Adobe', match: /adobe|\baem\b|marketo|magento|experience manager|workfront/i },
  servicenow: { name: 'ServiceNow', match: /servicenow|service now|\bsnow\b|\bitsm\b|\bitom\b|\bhrsd\b/i },
  workday: { name: 'Workday', match: /workday/i },
  successfactors: { name: 'SuccessFactors', match: /successfactors|success factors|\bsfsf\b/i },
}

/** The practices are the monday board's groups; each gets an emblem, a short name, its business apps and one of five accent-derived hues. */
const PRACTICES = [
  { name: 'SAP', short: 'SAP', Icon: SapPracticeIcon, vendors: ['sap'] },
  { name: 'Oracle', short: 'Oracle', Icon: OraclePracticeIcon, vendors: ['oracle'] },
  { name: 'Salesforce, Adobe, ServiceNow', short: 'SFDC · Adobe · SNOW', Icon: CrmPracticeIcon, vendors: ['salesforce', 'adobe', 'servicenow'] },
  { name: 'Workday & SuccessFactors', short: 'Workday · SF', Icon: HcmPracticeIcon, vendors: ['workday', 'successfactors'] },
  { name: 'AMO and Supply Chain Transformation', short: 'AMO · SCT', Icon: SupplyChainPracticeIcon, vendors: [] },
]

/** Emblem, short name, business apps and hue token for a practice; a group the list doesn't know still gets a stable hue. */
export function practiceOf(name) {
  const index = PRACTICES.findIndex((p) => p.name === name)
  if (index >= 0) return { ...PRACTICES[index], color: `var(--practice-${index + 1})` }
  const slot = [...String(name || '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % PRACTICES.length
  return { name: name || '', short: name || '', Icon: OtherPracticeIcon, vendors: [], color: `var(--practice-${slot + 1})` }
}

/** The business app a deal is about: its practice's only app, or the one the deal's text names; null when unclear. */
export function vendorOf(practice, text) {
  if (practice.vendors.length === 1) return practice.vendors[0]
  return practice.vendors.find((id) => VENDORS[id].match.test(String(text || ''))) || null
}

export const vendorName = (id) => VENDORS[id]?.name || ''

// SuccessFactors is an SAP product: it shows SAP's mark unless it gets its own file.
const LOGO_ALIASES = { successfactors: 'sap' }

/** Bundled logo URL for a business app, or null until its file is added. */
export const logoFor = (id) => (id && (LOGOS[id] || LOGOS[LOGO_ALIASES[id]])) || null
