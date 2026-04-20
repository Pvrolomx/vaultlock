import './globals.css'

export const metadata = {
  title: 'VaultLock',
  description: 'Gestor de contraseñas cifrado — AES-256',
  manifest: '/manifest.json',
  themeColor: '#080808',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VaultLock" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').then(function(reg) {
                console.log('SW registered:', reg.scope);
              }).catch(function(err) {
                console.log('SW error:', err);
              });
            });
          }
          var _deferredPrompt = null;
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            _deferredPrompt = e;
            window.dispatchEvent(new Event('pwa-installable'));
          });
          window.installPWA = function() {
            if (_deferredPrompt) {
              _deferredPrompt.prompt();
              _deferredPrompt.userChoice.then(function() { _deferredPrompt = null; });
            } else {
              var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
              if (isIOS) {
                alert('En Safari: toca el boton compartir y luego "Anadir a pantalla de inicio"');
              } else {
                alert('En Chrome: toca el menu y selecciona "Anadir a pantalla de inicio" o "Instalar app"');
              }
            }
          };
          window.addEventListener('appinstalled', function() {
            window.dispatchEvent(new Event('pwa-installed'));
          });
        `}} />
      </head>
      <body>{children}</body>
    </html>
  )
}
