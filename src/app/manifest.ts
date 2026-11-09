import type { MetadataRoute } from 'next';

// Makes the app installable (a shortcut on the desktop or the home screen that opens it in its own window,
// without the browser bars). It opens at /login, which sends a signed in person straight to the PDV.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Meu Comércio',
    short_name: 'Meu Comércio',
    description: 'PDV e gestão financeira para pequeno varejo',
    lang: 'pt-BR',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#f3f6fa',
    theme_color: '#2457c5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Venda', short_name: 'Venda', url: '/pdv', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Gestão', short_name: 'Gestão', url: '/gestao', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  };
}
