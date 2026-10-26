import { FormField } from '../../../shared/ui/FormField'

export default function ApproversTab({
  approverRoles,
  defaultApprovers,
  setDefaultApprovers,
  savedKey,
  saveIndividualApprover,
  clearApprover,
}) {
  return (
    <div className="settings-section">
      <h3>Default SAL Approvers</h3>
      <p className="section-description">
        These Service Area Leads will be automatically assigned to new deals. PALs (Process Area Leads) can be added manually per deal by the SAL or deal team. Name is required; email, Slack, and phone are optional.
      </p>

      <div className="approvers-list">
        {approverRoles.map((role) => {
          const approver = defaultApprovers[role.key] || { name: '', email: '', slack: '', phone: '' }
          const hasName = approver.name && approver.name.trim() !== ''

          return (
            <div key={role.key} className="approver-card">
              <div className="approver-card-header-row">
                <h4>{role.label}</h4>
                {hasName && (
                  <div className="approver-actions-row">
                    {savedKey === role.key && (
                      <span className="save-confirmation">✓ Saved!</span>
                    )}
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => clearApprover(role.key)}
                    >
                      Clear
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => saveIndividualApprover(role.key)}
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>

              {hasName ? (
                <div className="approver-display">
                  <div className="approver-name-display">
                    <strong>{approver.name}</strong>
                  </div>
                  <div className="approver-info-display">
                    {approver.email && <div><strong>Email:</strong> {approver.email}</div>}
                    {approver.slack && <div><strong>Slack:</strong> {approver.slack}</div>}
                    {approver.phone && <div><strong>Phone:</strong> {approver.phone}</div>}
                  </div>
                  <div className="approver-form-grid">
                    <FormField label="Email">
                      <input
                        type="email"
                        value={approver.email || ''}
                        onChange={(e) => setDefaultApprovers({
                          ...defaultApprovers,
                          [role.key]: { ...approver, email: e.target.value },
                        })}
                        placeholder="email@ibm.com"
                      />
                    </FormField>
                    <FormField label="Slack">
                      <input
                        type="text"
                        value={approver.slack || ''}
                        onChange={(e) => setDefaultApprovers({
                          ...defaultApprovers,
                          [role.key]: { ...approver, slack: e.target.value },
                        })}
                        placeholder="@username"
                      />
                    </FormField>
                    <FormField label="Phone">
                      <input
                        type="tel"
                        value={approver.phone || ''}
                        onChange={(e) => setDefaultApprovers({
                          ...defaultApprovers,
                          [role.key]: { ...approver, phone: e.target.value },
                        })}
                        placeholder="+1 (555) 123-4567"
                      />
                    </FormField>
                  </div>
                </div>
              ) : (
                <div className="approver-form-grid-full">
                  <FormField label="Name" required>
                    <input
                      type="text"
                      value={approver.name || ''}
                      onChange={(e) => setDefaultApprovers({
                        ...defaultApprovers,
                        [role.key]: { ...approver, name: e.target.value },
                      })}
                      placeholder="Enter full name to set up this approver"
                      required
                    />
                  </FormField>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
