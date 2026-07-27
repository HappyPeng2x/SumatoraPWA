import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getStoredTheme } from './theme'

// Applied synchronously, before the first paint, so a returning visitor with
// a non-default theme never sees a flash of the default one.
applyTheme(getStoredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
