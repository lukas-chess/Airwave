import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Offline-Funktion: Service Worker registrieren (nur wenn der Browser es kann)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
}
