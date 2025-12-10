/**
 * Renderer Process Entry Point
 * Reuses saas-frontend React app
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../../../saas-frontend/src/App.tsx';
import '../../../saas-frontend/src/styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
