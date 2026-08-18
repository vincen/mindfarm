import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'mind-elixir/style.css'
import './assets/main.css'
import App from './App'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
