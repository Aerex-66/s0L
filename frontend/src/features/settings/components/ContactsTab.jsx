import { FormField } from '../../../shared/ui/FormField'

export default function ContactsTab({
  contacts,
  newContact,
  setNewContact,
  addContact,
  deleteContact,
}) {
  return (
    <div className="settings-section">
      <h3>Master Contact List</h3>
      <p className="section-description">Global contact directory. These contacts are available across all deals and cannot be edited per-deal.</p>

      <div className="add-contact-form">
        <h4>Add New Contact</h4>
        <div className="form-grid">
          <FormField label="Name" required>
            <input
              type="text"
              value={newContact.name}
              onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              placeholder="Full name"
            />
          </FormField>
          <FormField label="Email" required>
            <input
              type="email"
              value={newContact.email}
              onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
              placeholder="email@ibm.com"
            />
          </FormField>
          <FormField label="Role">
            <input
              type="text"
              value={newContact.role}
              onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
              placeholder="e.g., Delivery Partner"
            />
          </FormField>
          <FormField label="Phone">
            <input
              type="tel"
              value={newContact.phone}
              onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
            />
          </FormField>
        </div>
        <button
          className="btn btn-primary"
          onClick={addContact}
          disabled={!newContact.name?.trim() || !newContact.email?.trim()}
        >+ Add Contact</button>
      </div>

      <div className="contacts-list">
        <h4>All Contacts ({contacts.length})</h4>
        <div className="contacts-grid">
          {contacts.map((contact) => (
            <div key={contact.id} className="contact-card">
              <div className="contact-card-header">
                <h5>{contact.name}</h5>
                <button
                  className="btn-icon btn-danger-icon"
                  onClick={() => deleteContact(contact.id)}
                  title="Remove contact"
                >
                  ×
                </button>
              </div>
              <div className="contact-card-body">
                <div className="contact-info">
                  <span className="contact-label">Email:</span>
                  <span>{contact.email}</span>
                </div>
                {contact.role && (
                  <div className="contact-info">
                    <span className="contact-label">Role:</span>
                    <span>{contact.role}</span>
                  </div>
                )}
                {contact.phone && (
                  <div className="contact-info">
                    <span className="contact-label">Phone:</span>
                    <span>{contact.phone}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
