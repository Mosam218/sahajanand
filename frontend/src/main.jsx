import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './components/State/State.css';
import { Router } from './router/index.jsx';
import { AppProvider } from './context/AppContext.jsx';
import App from './App.jsx';
import { installImageFallback } from './utils/format.js';

installImageFallback();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <AppProvider>
        <App />
      </AppProvider>
    </Router>
  </React.StrictMode>
);
