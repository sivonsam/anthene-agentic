import React from 'react'
import ReactDOM from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { msalConfig, DEV_MODE } from './config'
import App from './App'
import './App.css'

let msalInstance
if (!DEV_MODE) {
  msalInstance = new PublicClientApplication(msalConfig)
} else {
  // Dev mode: minimal MSAL stub
  msalInstance = { initialize: async () => {}, handleRedirectPromise: async () => null }
}

async function main() {
  if (msalInstance.initialize) await msalInstance.initialize()
  if (msalInstance.handleRedirectPromise) await msalInstance.handleRedirectPromise()

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      {DEV_MODE ? (
        <App />
      ) : (
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      )}
    </React.StrictMode>
  )
}

main()
