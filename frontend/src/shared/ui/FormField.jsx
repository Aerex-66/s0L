/**
 * Shared form field wrapper components.
 * Replaces repeated <div className="form-group"><label>...</label>...</div> pattern.
 */

/**
 * FormField – wraps a label + child input/select in a .form-group div.
 * @param {string}  label     – Field label text
 * @param {boolean} required  – Shows * after label
 * @param {string}  className – Extra class on wrapper
 */
export function FormField({ label, required, className = '', children }) {
  return (
    <div className={`form-group ${className}`}>
      <label>{label}{required && ' *'}</label>
      {children}
    </div>
  )
}

/**
 * FormCheckbox – checkbox with label wrapper.
 */
export function FormCheckbox({ label, checked, onChange, className = '' }) {
  return (
    <div className={`form-group ${className}`}>
      <label className="checkbox-label">
        <input type="checkbox" checked={checked} onChange={onChange} />
        {label}
      </label>
    </div>
  )
}
