import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { dealService } from '../../../shared/services/dealService'
import Modal from '../../../shared/ui/Modal'
import { UploadIcon } from '../../../shared/ui/Icons'
import { cx } from '../../../shared/utils/cx'

const DEAL_FIELDS = [
  { key: 'project_name', label: 'Project Name', required: true },
  { key: 'client_name', label: 'Client Name', required: true },
  { key: 'opportunity_number', label: 'Opportunity Number', required: true },
  { key: 'implementation_type', label: 'Implementation Type', required: false },
  { key: 'deal_type', label: 'Deal Type', required: false },
  { key: 'market', label: 'Market', required: false },
  { key: 'sector', label: 'Sector', required: false },
  { key: 'industry', label: 'Industry', required: false },
  { key: 'rate_card', label: 'Rate Card', required: false },
  { key: 'price_to_win', label: 'Price to Win', required: false },
  { key: 'status', label: 'Status', required: false },
]

export default function ImportModal({ onClose, onImport }) {
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [parsedData, setParsedData] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState(null)

  const autoMapFields = useCallback((fileHeaders) => {
    const newMapping = {}
    DEAL_FIELDS.forEach((field) => {
      const match = fileHeaders.find((header) =>
        String(header).toLowerCase().replace(/[^a-z0-9]/g, '') ===
        field.key.toLowerCase().replace(/[^a-z0-9]/g, '')
      )
      if (match) newMapping[field.key] = match
    })
    setMapping(newMapping)
  }, [])

  const parseCSV = useCallback((uploadFile) => {
    Papa.parse(uploadFile, {
      header: true,
      skipEmptyLines: true,
      complete: (parseResult) => {
        if (!parseResult.data || parseResult.data.length === 0) {
          alert('No data found in CSV file')
          return
        }

        const fileHeaders = parseResult.meta.fields || []
        setHeaders(fileHeaders)
        setParsedData(parseResult.data)
        autoMapFields(fileHeaders)
        setStep(2)
      },
      error: (error) => {
        alert(`Error parsing CSV: ${error.message}`)
      }
    })
  }, [autoMapFields])

  const onDrop = useCallback((acceptedFiles) => {
    if (!acceptedFiles.length) return

    const uploadFile = acceptedFiles[0]
    setFile(uploadFile)

    if (uploadFile.name.endsWith('.csv')) {
      parseCSV(uploadFile)
      return
    }

    alert('Please upload a CSV file')
  }, [parseCSV])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1
  })

  const handleImport = async () => {
    const missingRequired = DEAL_FIELDS
      .filter((field) => field.required && !mapping[field.key])
      .map((field) => field.label)

    if (missingRequired.length > 0) {
      alert(`Please map required fields: ${missingRequired.join(', ')}`)
      return
    }

    setImporting(true)
    setStep(4)

    try {
      const deals = parsedData.map((row) => {
        const mappedDeal = {}
        Object.entries(mapping).forEach(([dealField, fileHeader]) => {
          if (fileHeader && row[fileHeader] !== undefined) {
            mappedDeal[dealField] = row[fileHeader]
          }
        })
        return mappedDeal
      })

      const result = await dealService.bulkCreate({ deals })
      setResults(result)
      onImport()
    } catch (error) {
      alert(`Import failed: ${error.message}`)
      setStep(3)
    } finally {
      setImporting(false)
    }
  }

  const previewData = parsedData.slice(0, 5).map((row) => {
    const preview = {}
    Object.entries(mapping).forEach(([dealField, fileHeader]) => {
      if (fileHeader && row[fileHeader] !== undefined) {
        preview[dealField] = row[fileHeader]
      }
    })
    return preview
  })

  return (
    <Modal title="Import Deals" onClose={onClose} className="modal-large">
      {step === 1 && (
        <div className="import-step">
          <div {...getRootProps()} className={cx('dropzone', isDragActive && 'active')}>
            <input {...getInputProps()} />
            <div className="dropzone-content">
              <UploadIcon size={48} />
              {isDragActive ? <p>Drop the file here...</p> : (
                <>
                  <p>Drag & drop a CSV file here</p>
                  <p className="dropzone-hint">or click to browse</p>
                </>
              )}
              <div className="dropzone-formats">Supported format: .csv</div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="import-step">
          <h3>Map Fields</h3>
          <p className="import-description">Match your file columns to deal fields. Required fields are marked with *</p>
          <div className="field-mapping">
            {DEAL_FIELDS.map((field) => (
              <div key={field.key} className="mapping-row">
                <label>
                  {field.label} {field.required && <span className="required">*</span>}
                </label>
                <select
                  value={mapping[field.key] || ''}
                  onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                >
                  <option value="">-- Skip --</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="import-stats">Found {parsedData.length} rows in {file?.name || 'file'}</div>
        </div>
      )}

      {step === 3 && (
        <div className="import-step">
          <h3>Preview ({previewData.length} of {parsedData.length})</h3>
          <div className="import-preview">
            <table className="preview-table">
              <thead>
                <tr>
                  {DEAL_FIELDS.filter((field) => mapping[field.key]).map((field) => (
                    <th key={field.key}>{field.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, index) => (
                  <tr key={index}>
                    {DEAL_FIELDS.filter((field) => mapping[field.key]).map((field) => (
                      <td key={field.key}>{row[field.key] || '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="import-step import-processing">
          {importing ? (
            <>
              <div className="spinner"></div>
              <h3>Importing deals...</h3>
              <p>Please wait while we process your data</p>
            </>
          ) : results && (
            <div className="import-results">
              <h3>Import Complete!</h3>
              <div className="results-stats">
                <div className="stat success">
                  <span className="stat-value">{results.created}</span>
                  <span className="stat-label">Created</span>
                </div>
                <div className="stat error">
                  <span className="stat-value">{results.failed}</span>
                  <span className="stat-label">Failed</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{results.total}</span>
                  <span className="stat-label">Total</span>
                </div>
              </div>
              {results.errors?.length > 0 && (
                <div className="import-errors mt-md text-sm text-danger">
                  <strong>Issues:</strong>
                  <ul className="import-errors-list">
                    {results.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="modal-footer">
        {step > 1 && step < 4 && (
          <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>Back</button>
        )}
        {step === 2 && (
          <button className="btn btn-primary" onClick={() => setStep(3)}>Preview</button>
        )}
        {step === 3 && (
          <button className="btn btn-primary" onClick={handleImport}>Import {parsedData.length} Deals</button>
        )}
        {step === 4 && !importing && (
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>{step === 1 ? 'Cancel' : 'Close'}</button>
      </div>
    </Modal>
  )
}
