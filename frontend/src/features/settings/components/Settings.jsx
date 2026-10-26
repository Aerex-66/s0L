import { useState, useEffect } from 'react'
import { settingsService } from '../settingsService'
import ApproversTab from './ApproversTab'
import DirectoryTab from './DirectoryTab'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog'
import Modal from '../../../shared/ui/Modal'
import { useAsyncLoad } from '../../../shared/useAsyncLoad'

export default function Settings({ onClose }) {
  const [directory, setDirectory] = useState([])
  const [defaultApprovers, setDefaultApprovers] = useState({})
  const [activeTab, setActiveTab] = useState('directory')
  const [savedKey, setSavedKey] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: '',
    message: '',
    onConfirm: null,
  })

  const { data: loadedDirectory, reload: reloadDirectory } = useAsyncLoad(
    () => settingsService.getDirectory(),
    [],
    []
  )

  const { data: loadedDefaultApprovers } = useAsyncLoad(
    () => settingsService.getDefaultApprovers(),
    [],
    {}
  )

  useEffect(() => {
    if (Array.isArray(loadedDirectory)) setDirectory(loadedDirectory)
  }, [loadedDirectory])

  useEffect(() => {
    if (loadedDefaultApprovers && typeof loadedDefaultApprovers === 'object') {
      setDefaultApprovers(loadedDefaultApprovers)
    }
  }, [loadedDefaultApprovers])

  // --- Approvers tab actions (SAL grid) ---
  const saveIndividualApprover = async (key) => {
    try {
      setSaveError('')
      await settingsService.updateDefaultApprovers(defaultApprovers)
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
      reloadDirectory()
    } catch (error) {
      console.error('Error saving approver:', error)
      setSaveError(`Unable to save approver changes: ${error.message}`)
    }
  }

  const clearApprover = async (key) => {
    setConfirmState({
      open: true,
      title: 'Clear Approver',
      message: 'Clear this approver and remove all associated details?',
      onConfirm: async () => {
        const clearedApprovers = {
          ...defaultApprovers,
          [key]: { name: '', email: '', slack: '', phone: '' }
        }
        setDefaultApprovers(clearedApprovers)
        try {
          await settingsService.updateDefaultApprovers(clearedApprovers)
          reloadDirectory()
        } catch (error) {
          console.error('Error clearing approver:', error)
        }
      },
    })
  }

  // --- Directory tab actions ---
  const addDirectoryContact = async (form) => {
    try {
      await settingsService.addDirectoryContact(form)
      reloadDirectory()
    } catch (error) {
      console.error('Error adding contact:', error)
    }
  }

  const updateDirectoryContact = async (id, form) => {
    try {
      await settingsService.updateDirectoryContact(id, form)
      setSavedId(id)
      setTimeout(() => setSavedId(null), 2000)
      reloadDirectory()
    } catch (error) {
      console.error('Error updating contact:', error)
    }
  }

  const deleteDirectoryContact = async (id) => {
    setConfirmState({
      open: true,
      title: 'Remove Contact',
      message: 'Remove this person from the directory?',
      onConfirm: async () => {
        try {
          await settingsService.deleteDirectoryContact(id)
          reloadDirectory()
        } catch (error) {
          console.error('Error deleting contact:', error)
          setSaveError(`Failed to delete contact: ${error.message}`)
        }
      },
    })
  }

  const approverRoles = [
    { key: 'RTR_SAL', label: 'RTR - Service Area Lead' },
    { key: 'OTC_SAL', label: 'OTC - Service Area Lead' },
    { key: 'PTP_Ariba_SAL', label: 'PTP/Ariba - Service Area Lead' },
    { key: 'FTPL_SAL', label: 'FTP&L - Service Area Lead' },
    { key: 'Data_SAL', label: 'Data - Service Area Lead' },
    { key: 'Analytics_SAL', label: 'Analytics - Service Area Lead' },
    { key: 'IBP_SAL', label: 'IBP - Service Area Lead' },
    { key: 'Security_SAL', label: 'Security - Service Area Lead' },
    { key: 'OCM_SAL', label: 'OCM - Service Area Lead' },
    { key: 'EPL_SAL', label: 'EPL - Service Area Lead' },
    { key: 'Group_Reporting_SAL', label: 'Group Reporting - Service Area Lead' },
    { key: 'SAC_SAL', label: 'SAC - Service Area Lead' },
  ]

  const settingsTabs = [
    { id: 'directory', label: 'Directory', subtitle: 'All people — approvers, leads, contacts', badge: directory.length },
    { id: 'approvers', label: 'SAL Defaults', subtitle: 'Service area lead routing' },
  ]

  return (
    <Modal title="Settings" onClose={onClose} className="settings-modal">
      <div className="settings-tabs">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              <span className="settings-tab-copy">
                <span className="settings-tab-label">{tab.label}</span>
                <span className="settings-tab-subtitle">{tab.subtitle}</span>
              </span>
              {typeof tab.badge === 'number' && (
                <span className="settings-tab-badge">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {saveError && <div className="text-danger">{saveError}</div>}

          {activeTab === 'directory' && (
            <DirectoryTab
              contacts={directory}
              onAdd={addDirectoryContact}
              onUpdate={updateDirectoryContact}
              onDelete={deleteDirectoryContact}
              savedId={savedId}
            />
          )}

          {activeTab === 'approvers' && (
            <ApproversTab
              approverRoles={approverRoles}
              defaultApprovers={defaultApprovers}
              setDefaultApprovers={setDefaultApprovers}
              savedKey={savedKey}
              saveIndividualApprover={saveIndividualApprover}
              clearApprover={clearApprover}
            />
          )}
        </div>

      <ConfirmDialog
        isOpen={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel="Confirm"
        onCancel={() => setConfirmState({ open: false, title: '', message: '', onConfirm: null })}
        onConfirm={async () => {
          const runConfirm = confirmState.onConfirm
          setConfirmState({ open: false, title: '', message: '', onConfirm: null })
          if (runConfirm) {
            await runConfirm()
          }
        }}
      />
    </Modal>
  )
}
