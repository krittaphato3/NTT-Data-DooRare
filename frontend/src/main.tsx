import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider as CognitoAuthProvider } from 'react-oidc-context';
import { cognitoAuthConfig } from './config/cognito';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CognitoAuthProvider {...cognitoAuthConfig}>
      <App />
    </CognitoAuthProvider>
  </React.StrictMode>,
);
