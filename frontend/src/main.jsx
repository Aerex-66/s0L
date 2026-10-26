import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ibm/plex-sans/css/ibm-plex-sans-all.min.css'
import '@ibm/plex-mono/css/ibm-plex-mono-all.min.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
