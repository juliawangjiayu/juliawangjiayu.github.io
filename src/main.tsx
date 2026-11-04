import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { VisitorIdentityProvider } from './components/VisitorIdentityProvider.tsx';
import './styles/tokens.css';
import './styles/global.css';
import './styles/sectionThemes.css';
import './styles/aboutTheme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VisitorIdentityProvider><App /></VisitorIdentityProvider>
  </StrictMode>,
);

