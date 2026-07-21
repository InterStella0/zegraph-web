// Service Worker for Push Notifications
const NOTIFICATION_TAG = 'ze-graph-notification';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'ZE Graph',
    body: 'New notification',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: NOTIFICATION_TAG,
    requireInteraction: false,
    data: {},
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        ...notificationData,
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        data: payload.data || {},
        tag: payload.tag || NOTIFICATION_TAG,
      };

      if (payload.image) {
        notificationData.image = payload.image;
      }
      const notificationType = payload.data?.notificationType;
      if (notificationType === 'map_change') {
        notificationData.actions = [
          { action: 'resubscribe', title: 'Wait for Another' },
          { action: 'join_now', title: 'Join Now' },
        ];
      } else if (notificationType === 'map_notify') {
        notificationData.actions = [
          { action: 'join_now', title: 'Join Now' },
          { action: 'map_info', title: 'Map Info' },
        ];
      }
    } catch {
      // Ignore parse errors
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

self.addEventListener('notificationclick', (event) => {
  // Handle "Wait for Another" action (map_change)
  if (event.action === 'resubscribe') {
    event.notification.close();
    const serverId = event.notification.data?.serverId;
    const subscriptionId = event.notification.data?.subscriptionId;

    if (serverId && subscriptionId) {
      event.waitUntil(
        fetch('/api/accounts/me/push/map-change/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            server_id: serverId,
            subscription_id: subscriptionId,
          }),
        })
          .catch(() => {})
      );
    }
    return;
  }

  // Handle "Dismiss" action
  if (event.action === 'dismiss') {
    event.notification.close();
    return;
  }

  // Handle "Join Now" action (map_notify)
  if (event.action === 'join_now') {
    event.notification.close();
    const serverId = event.notification.data?.serverId;

    if (serverId) {
      // Open the connect page which handles the steam:// redirect
      const connectUrl = new URL(`/connect/${serverId}`, self.location.origin).href;
      event.waitUntil(
        clients.openWindow(connectUrl)
      );
    }
    return;
  }

  // Handle "Map Info" action (map_notify)
  if (event.action === 'map_info') {
    event.notification.close();
    const mapInfoUrl = event.notification.data?.mapInfoUrl;

    if (mapInfoUrl) {
      const fullUrl = new URL(mapInfoUrl, self.location.origin).href;
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((clientList) => {
            for (const client of clientList) {
              if (client.url === fullUrl && 'focus' in client) {
                return client.focus();
              }
            }
            if (clients.openWindow) {
              return clients.openWindow(fullUrl);
            }
          })
      );
    }
    return;
  }

  // No action = clicking notification body, open URL
  event.notification.close();
  const urlToOpen = new URL(
    event.notification.data?.url || '/',
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if found
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
