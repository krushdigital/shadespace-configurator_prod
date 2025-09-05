import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './index.css';

createRoot(document.getElementById('SHADE_SPACE')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
