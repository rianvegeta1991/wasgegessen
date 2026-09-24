/* WasGegessen? – Service Worker (Offline-Betrieb)
 * Bei Dateiänderungen die Versionsnummer hochzählen. */
const CACHE = 'wasgegessen-v6';
const ASSETS = [
  './',
  './index.html',
  // mit derselben Versionsnummer wie in index.html, sonst landen die
  // Skripte doppelt im Cache und die Seite holt sie trotzdem aus dem Netz
  './daten.js?v=1.4',
  './grundnahrung.js?v=1.4',
  './off.js?v=1.4',
  './vision.js?v=1.4',
  './app.js?v=1.4',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // einzeln cachen: eine fehlende Datei darf die Installation nicht scheitern lassen
      Promise.all(ASSETS.map((url) =>
        cache.add(url).catch((err) => console.warn('[SW] nicht gecacht:', url, err))
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nur eigene Dateien bedienen. Die Lebensmitteldatenbank und die
  // Anthropic-API gehen immer direkt ins Netz – nie aus dem Cache.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Die Seite selbst erst aus dem Netz holen, den Cache nur als Rückfall.
  // Sonst bliebe nach einem Update die alte index.html liegen – und mit ihr
  // die alten Skriptverweise, obwohl die neuen Dateien längst da sind.
  if (event.request.mode === 'navigate'){
    event.respondWith(
      fetch(event.request)
        .then((antwort) => {
          const kopie = antwort.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, kopie));
          return antwort;
        })
        .catch(() => caches.match(event.request).then((t) => t || caches.match('./index.html')))
    );
    return;
  }

  // Alles andere aus dem Cache: die Skripte tragen ihre Version in der
  // Adresse, eine neue Fassung ist also immer eine neue Anfrage.
  event.respondWith(
    caches.match(event.request).then((treffer) => {
      if (treffer) return treffer;
      return fetch(event.request)
        .then((antwort) => {
          if (antwort.ok){
            const kopie = antwort.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, kopie));
          }
          return antwort;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
