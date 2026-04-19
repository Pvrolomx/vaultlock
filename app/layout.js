import './globals.css'

export const metadata = {
  title: 'VaultLock',
  description: 'Gestor de contraseñas cifrado — AES-256',
  manifest: '/manifest.json',
  themeColor: '#0a0a0a',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="VaultLock" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js');
            });
          }
          let _deferredPrompt;
          window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            _deferredPrompt = e;
            window.dispatchEvent(new Event('pwa-installable'));
          });
          window.installPWA = function() {
            if (!_deferredPrompt) return;
            _deferredPrompt.prompt();
            _deferredPrompt.userChoice.then(() => { _deferredPrompt = null; });
          };
          window.addEventListener('appinstalled', () => {
            window.dispatchEvent(new Event('pwa-installed'));
          });
        `}} />
      </head>
      <body>{children}</body>
    </html>
  )
}
