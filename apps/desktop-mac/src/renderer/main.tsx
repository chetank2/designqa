/**
 * Renderer Process Entry Point
 * Reuses saas-frontend React app with the same provider stack
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../saas-frontend/src/contexts/AuthContext';
import { ModeProvider } from '../../../saas-frontend/src/contexts/ModeContext';
import App from '../../../saas-frontend/src/App.tsx';
import '../../../saas-frontend/src/styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1
    }
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <QueryClientProvider client={queryClient}>
    <ModeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ModeProvider>
  </QueryClientProvider>
);
