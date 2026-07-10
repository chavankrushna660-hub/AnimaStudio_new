import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { runSecurityShield } from './utils/securityGuard';

// Launch strict client security protection shield immediately on system boot
runSecurityShield();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
