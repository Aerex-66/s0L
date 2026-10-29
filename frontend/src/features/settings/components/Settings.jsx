import { useState } from 'react'
import MondayTab from './MondayTab'
import SalesforceTab from './SalesforceTab'
import MyViewTab from './MyViewTab'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog'
import Modal from '../../../shared/ui/Modal'
import useUpdateStore, { readyUpdate } from '../../../shared/updateStore'

// People (the old Directory and SAL Defaults) live in the Outlook panel's Quick contacts.
const SETTINGS_TABS = [
  { id: 'view', label: 'My view', subtitle: 'Your name and whose deals you see' },
  { id: 'monday', label: 'monday', subtitle: 'Deal board sync' },
  { id: 'salesforce', label: 'Salesforce', subtitle: 'IBM Sales Cloud check' },
]

const CLOSED = { open: false, title: '', message: '', onConfirm: null }

export default function Settings({ onClose, initialTab }) {
  const updateReady = useUpdateStore((s) => readyUpdate(s.status))
  const restartForUpdate = useUpdateStore((s) => s.restartNow)
  const [activeTab, setActiveTab] = useState(SETTINGS_TABS.some((tab) => tab.id === initialTab) ? initialTab : 'view')
  const [confirmState, setConfirmState] = useState(CLOSED)
  const askFirst = (title, message, onConfirm) => setConfirmState({ open: true, title, message, onConfirm })

  return (
    <Modal title="Settings" onClose={onClose} className="settings-modal">
      <div className="settings-tabs">
          {SETTINGS_TABS.map((tab) => (
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
            </button>
          ))}
        </div>

        <div className="modal-body">
          {updateReady && (
            <div className="settings-update" role="status">
              <span><b>s0L {updateReady} is ready.</b> Restart s0L to use it. Your deals and documents stay as they are.</span>
              <button className="btn btn-primary" onClick={() => { onClose(); restartForUpdate() }}>Restart now</button>
            </div>
          )}

          {activeTab === 'view' && <MyViewTab />}

          {activeTab === 'monday' && <MondayTab onConfirm={askFirst} />}

          {activeTab === 'salesforce' && <SalesforceTab onConfirm={askFirst} />}
        </div>

      <ConfirmDialog
        isOpen={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel="Confirm"
        onCancel={() => setConfirmState(CLOSED)}
        onConfirm={async () => {
          const runConfirm = confirmState.onConfirm
          setConfirmState(CLOSED)
          if (runConfirm) {
            await runConfirm()
          }
        }}
      />
    </Modal>
  )
}
