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
      </head>
      <body>{children}</body>
    </html>
  )
}
