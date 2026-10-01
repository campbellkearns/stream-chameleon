import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast'

// Hide the loading screen when React app is ready
const hideLoadingScreen = () => {
  const loadingElement = document.getElementById('app-loading');
  if (loadingElement) {
    document.body.classList.add('app-loaded');
    // Remove loading screen after transition
    setTimeout(() => {
      if (loadingElement.parentNode) {
        loadingElement.parentNode.removeChild(loadingElement);
      }
    }, 300);
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Hide loading screen after React has rendered
setTimeout(hideLoadingScreen, 100);