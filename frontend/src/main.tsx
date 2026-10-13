import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initHub, requireUser } from './lib/hub'

const root = createRoot(document.getElementById('root')!)

// Everyone signs in once, at the class hub: without a session the hub signs the visitor in
// (silently when they're still signed in to Google) and sends them back here.
async function start() {
  try {
    initHub()
    const user = await requireUser()
    root.render(
      <StrictMode>
        <App user={user} />
      </StrictMode>,
    )
  } catch (error) {
    console.error('Class hub sign-in failed:', error)
    root.render(
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8 text-center">
        <div>
          <h1 className="text-2xl font-bold text-navy mb-4">Couldn't reach the class hub</h1>
          <p className="text-gray-600">Please reload the page in a moment.</p>
        </div>
      </div>,
    )
  }
}

start()
