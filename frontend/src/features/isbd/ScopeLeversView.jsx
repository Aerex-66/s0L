import { memo, useState, useCallback, useMemo } from 'react'

/* ── Section category constants ── */
const SECTION_IBM = 'ibm'
const SECTION_CLIENT = 'client'
const SECTION_OOS = 'oos'
const SECTION_SCOPE = 'scope'

const SECTION_META = {
  [SECTION_SCOPE]:  { label: 'In Scope',              cls: 'in-scope' },
  [SECTION_OOS]:    { label: 'Out of Scope',           cls: 'oos' },
  [SECTION_IBM]:    { label: 'IBM Responsibility',     cls: 'ibm' },
  [SECTION_CLIENT]: { label: 'Client Responsibility',  cls: 'client' },
}

/* ── Parse raw cell text into tagged sections ── */
function parseScopeCell(raw) {
  if (!raw) return []
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const sections = []
  let currentTag = SECTION_SCOPE
  let currentItems = []

  const flush = () => {
    if (currentItems.length) {
      sections.push({ tag: currentTag, items: [...currentItems] })
      currentItems = []
    }
  }

  for (const line of lines) {
    const lower = line.toLowerCase().replace(/[:\s]+$/, '')
    if (/^out\s+of\s+scope/.test(lower)) {
      flush(); currentTag = SECTION_OOS; continue
    }
    if (/^client\s+responsibilit/.test(lower)) {
      flush(); currentTag = SECTION_CLIENT; continue
    }
    if (/^ibm\s+responsibilit/.test(lower)) {
      flush(); currentTag = SECTION_IBM; continue
    }
    // Clean leading bullets
    const cleaned = line.replace(/^[•\-–—]\s*/, '').replace(/\s*\/\/\s*/g, ' · ')
    if (cleaned) currentItems.push(cleaned)
  }
  flush()
  return sections
}

/* ── Column definitions matching the template ── */
const SCOPE_OVERVIEW_COLS = [
  { key: 'scope_project_overview', header: 'Project Scope' },
  { key: 'scope_business_process', header: 'Business Process' },
  { key: 'scope_apps_ecosystem',   header: 'Applications' },
  { key: 'scope_organization',     header: 'Organization' },
  { key: 'scope_ocm_training',     header: 'OCM & Training' },
]

const DELIVERY_DETAIL_COLS = [
  { key: 'scope_custom_dev',     header: 'Development' },
  { key: 'scope_data_migration', header: 'Data & Analytics' },
  { key: 'scope_tech_infra',     header: 'Technology & Basis' },
  { key: 'scope_security',       header: 'Roles & Security' },
  { key: 'scope_testing',        header: 'Testing' },
  { key: 'scope_delivery',       header: 'Delivery Approach' },
]

/* ── Prompt templates shown when field is empty ── */
const FIELD_PROMPTS = {
  scope_project_overview: [
    { tag: SECTION_SCOPE, items: [
      'Source → Target platform (e.g. ECC → S/4HANA)',
      'Implementation approach (Greenfield / Brownfield / Selective)',
      'Total duration',
      'Core principles (Clean Core, Fit-to-Standard %)',
      'Go-live strategy (Big Bang / Phased)',
      'Business units in scope',
      'Deployment locations',
    ]},
  ],
  scope_business_process: [
    { tag: SECTION_SCOPE, items: [
      'Finance (RTR)',
      'Sales & Distribution (OTC)',
      'Procurement (PTP)',
      'Production Planning (PTM)',
      'Master Data Governance',
      'Supply Chain / IBP',
      'Other process areas',
    ]},
  ],
  scope_apps_ecosystem: [
    { tag: SECTION_SCOPE, items: [
      'Module breakdown per process area (e.g. RTR: GL, FI/CO, AP/AR, AA)',
      'Analytics platform (Embedded, SAC, BW)',
      'Integration middleware (BTP, webMethods)',
    ]},
    { tag: SECTION_OOS, items: [
      'Modules or capabilities explicitly excluded',
    ]},
  ],
  scope_organization: [
    { tag: SECTION_SCOPE, items: [
      'HQ / Client location',
      'In-scope locations / countries',
      'Number of subsidiaries',
      'Employee count',
      'Revenue estimate',
      'Entity type (Public / Private)',
      'Business units in scope',
    ]},
  ],
  scope_ocm_training: [
    { tag: SECTION_SCOPE, items: [
      'Change impact assessment approach',
      'Training strategy & curriculum design',
      'Client OCM counterpart arrangement',
    ]},
    { tag: SECTION_OOS, items: [
      'Legacy / 3rd party OCM',
      'Organizational design',
      'Super user management',
      'Translation services',
      'LMS / training environment setup',
    ]},
  ],
  scope_custom_dev: [
    { tag: SECTION_SCOPE, items: [
      'Standard Fiori apps count & basis',
      'Custom development expectations',
      'Interface approach (BTP Integration Suite, etc.)',
      'Reporting standardization strategy',
    ]},
  ],
  scope_data_migration: [
    { tag: SECTION_SCOPE, items: [
      'Data migration methodology',
      'Analytics platform / reporting stack',
      'Data volumes / objects in scope',
    ]},
    { tag: SECTION_CLIENT, items: [
      'Legacy data extraction & cleansing',
      'Environment provisioning',
    ]},
  ],
  scope_tech_infra: [
    { tag: SECTION_SCOPE, items: [
      'Basis activities scope & duration',
      'Technical development & integration',
      'Transport management',
      'Batch job scheduling',
    ]},
    { tag: SECTION_CLIENT, items: [
      'Infrastructure support & maintenance',
      'Compliance monitoring',
      '3rd party system coordination',
    ]},
  ],
  scope_security: [
    { tag: SECTION_IBM, items: [
      'Security, Roles & Authorization management',
      'Environment setup',
      'Security role configuration',
      'Workflow role-based security',
    ]},
    { tag: SECTION_CLIENT, items: [
      'Security post go-live',
      'Segregation of Duties analysis',
    ]},
  ],
  scope_testing: [
    { tag: SECTION_IBM, items: [
      'Unit testing',
      'System integration testing',
      'Cutover verification testing',
      'Performance testing approach',
    ]},
    { tag: SECTION_CLIENT, items: [
      'User acceptance testing (UAT)',
      'Data conversion testing',
      'User authorization testing',
    ]},
  ],
  scope_delivery: [
    { tag: SECTION_SCOPE, items: [
      'Delivery model (Onsite / Nearshore / Offshore)',
      'SAP landscape details',
      'Project start date',
      'Go-live timeline + hypercare duration',
    ]},
    { tag: SECTION_IBM, items: [
      'Test phases owned by IBM',
    ]},
    { tag: SECTION_CLIENT, items: [
      'Test phases owned by client',
    ]},
  ],
}

/* ── Section renderer ── */
function ScopeSection({ tag, items, isPrompt }) {
  const meta = SECTION_META[tag] || SECTION_META[SECTION_SCOPE]
  return (
    <div className={`slv-section slv-section--${meta.cls}${isPrompt ? ' slv-section--prompt' : ''}`}>
      {tag !== SECTION_SCOPE && (
        <div className="slv-section-tag">{meta.label}</div>
      )}
      <ul className="slv-items">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  )
}

/* ── Column card ── */
function ScopeColumn({ colDef, data, onChange, readOnly }) {
  const [editing, setEditing] = useState(false)
  const rawVal = data?.[colDef.key] || ''
  const sections = parseScopeCell(rawVal)
  const isEmpty = !sections.length
  const prompts = FIELD_PROMPTS[colDef.key] || []

  const handleSave = useCallback((e) => {
    if (onChange && colDef.key) onChange(colDef.key, e.target.value)
  }, [onChange, colDef.key])

  // Build placeholder text from prompts for the textarea
  const editPlaceholder = useMemo(() => {
    if (!prompts.length) return `Enter ${colDef.header.toLowerCase()} details...`
    return prompts.map(sec => {
      const tag = sec.tag !== SECTION_SCOPE ? (SECTION_META[sec.tag]?.label + ':\n') : ''
      return tag + sec.items.map(i => '• ' + i).join('\n')
    }).join('\n\n')
  }, [prompts, colDef.header])

  return (
    <div className={`slv-col${isEmpty ? ' slv-col--empty' : ''}${editing ? ' slv-col--editing' : ''}`}>
      <div className="slv-col-header">{colDef.header}</div>
      <div className="slv-col-body">
        {editing && !readOnly ? (
          <div className="slv-edit-wrap">
            <textarea
              className="slv-edit-area"
              defaultValue={rawVal}
              autoFocus
              onBlur={(e) => { handleSave(e); setEditing(false) }}
              placeholder={editPlaceholder}
            />
            {prompts.length > 0 && (
              <div className="slv-edit-hints">
                {prompts.map((sec, i) => (
                  <ScopeSection key={i} tag={sec.tag} items={sec.items} isPrompt />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className="slv-col-content"
            onClick={() => !readOnly && setEditing(true)}
            title={readOnly ? '' : 'Click to edit'}
          >
            {isEmpty ? (
              <div className="slv-prompts">
                {prompts.map((sec, i) => (
                  <ScopeSection key={i} tag={sec.tag} items={sec.items} isPrompt />
                ))}
                {!prompts.length && (
                  <span className="slv-placeholder">Click to add {colDef.header.toLowerCase()}</span>
                )}
              </div>
            ) : (
              sections.map((sec, i) => (
                <ScopeSection key={i} tag={sec.tag} items={sec.items} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main Levers of Scope view ── */
const ScopeLeversView = memo(function ScopeLeversView({ data, onChange, readOnly }) {
  return (
    <div className="slv-root">
      <div className="slv-table-group">
        <div className="slv-group-label">Scope Overview</div>
        <div className="slv-cols slv-cols--5">
          {SCOPE_OVERVIEW_COLS.map(col => (
            <ScopeColumn key={col.key} colDef={col} data={data} onChange={onChange} readOnly={readOnly} />
          ))}
        </div>
      </div>
      <div className="slv-table-group">
        <div className="slv-group-label">Delivery Detail</div>
        <div className="slv-cols slv-cols--6">
          {DELIVERY_DETAIL_COLS.map(col => (
            <ScopeColumn key={col.key} colDef={col} data={data} onChange={onChange} readOnly={readOnly} />
          ))}
        </div>
      </div>
    </div>
  )
})

export default ScopeLeversView
