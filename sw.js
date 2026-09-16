const CACHE = 'solotracker-v40';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './ranger-open.webp', './ranger-closed.webp'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// Network-first: always try to fetch the latest version first (so redeploys
// reach installed devices automatically), and only fall back to the cached
// copy if the network request fails (i.e. genuinely offline).
self.addEventListener('fetch', function(e){
  e.respondWith(
    fetch(e.request).then(function(res){
      var resClone = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, resClone); });
      return res;
    }).catch(function(){
      return caches.match(e.request);
    })
  );
});
