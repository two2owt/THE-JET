// Service Worker for Web Push Notifications only
// Main caching is handled by Workbox-generated sw.js

self.addEventListener('push', function(event) {
  console.log('[SW-Push] Push event received:', event);

  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'JET Notification',
        body: event.data.text()
      };
    }
  }

  const title = data.title || 'JET Deal Alert';
  const options = {
    body: data.body || 'Check out this deal!',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    tag: data.tag || 'jet-notification',
    data: {
      url: data.url || data.click_action || '/',
      dealId: data.dealId || null,
      venueId: data.venueId || null,
      venueName: data.venueName || null
    },
    actions: [
      {
        action: 'view',
        title: 'View Deal'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    vibrate: [100, 50, 100],
    requireInteraction: true,
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW-Push] Notification click received:', event);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const notificationData = event.notification.data || {};
  let urlToOpen = notificationData.url || '/';

  // Build deep link URL from payload so the app opens the exact JetCard /
  // deal sheet with parking, share and directions wired up.
  if (notificationData.dealId) {
    urlToOpen = `/?deal=${encodeURIComponent(notificationData.dealId)}`;
    if (notificationData.venueId) {
      urlToOpen += `&venue=${encodeURIComponent(notificationData.venueId)}`;
    }
  } else if (notificationData.venueId) {
    urlToOpen = `/?venue=${encodeURIComponent(notificationData.venueId)}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Always navigate so the SPA re-reads search params even when the
            // tab is already at "/". postMessage as a belt-and-suspenders signal
            // for the React layer to re-trigger deep-link handlers.
            return client.focus().then(function () {
              try { client.postMessage({ type: 'DEEP_LINK', url: urlToOpen }); } catch (e) {}
              return client.navigate(urlToOpen).catch(function () {
                if (clients.openWindow) return clients.openWindow(urlToOpen);
              });
            });
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', function(event) {
  console.log('[SW-Push] Notification closed:', event);
});

self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[SW-Push] Push subscription change event:', event);
  
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true })
      .then(function(subscription) {
        console.log('[SW-Push] New subscription:', subscription);
        return fetch('/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: subscription.toJSON().keys
          })
        });
      })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW-Push] Skip waiting requested');
    self.skipWaiting();
  }
  
  // Handle tile prefetch requests from main thread
  if (event.data && event.data.type === 'PREFETCH_TILES') {
    console.log('[SW-Push] Tile prefetch requested:', event.data.urls?.length || 0, 'tiles');
    
    const urls = event.data.urls || [];
    
    // Prefetch tiles in background with low priority
    event.waitUntil(
      prefetchTilesInBackground(urls)
    );
  }
});

// Background tile prefetching
async function prefetchTilesInBackground(urls) {
  const cache = await caches.open('mapbox-tiles-cache');
  let successCount = 0;
  
  // Prefetch in small batches with delays to avoid network congestion
  const BATCH_SIZE = 2;
  
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        // Check if already cached
        const cached = await cache.match(url);
        if (cached) return true;
        
        // Fetch and cache
        try {
          const response = await fetch(url, {
            mode: 'cors',
            credentials: 'omit',
          });
          
          if (response.ok) {
            await cache.put(url, response.clone());
            return true;
          }
        } catch (e) {
          // Ignore errors - tiles may not be critical
        }
        return false;
      })
    );
    
    successCount += results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    // Delay between batches to avoid hogging network
    if (i + BATCH_SIZE < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log('[SW-Push] Tile prefetch complete:', successCount, '/', urls.length);
}

self.addEventListener('install', function() {
  console.log('[SW-Push] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW-Push] Activated');
  event.waitUntil(self.clients.claim());
});
