import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource-variable/inter'
import '@fontsource-variable/manrope'
import '@fontsource-variable/outfit'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/sora'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
