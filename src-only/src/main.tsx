import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './i18n/LanguageContext'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/global.css'
import './styles/components.css'

ReactDOM.createRoot(document.getElementById('root')!)
  .render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>
  )
