// Misty Visuals OS — Push Notification Service Worker
// This file must be at the root of the public directory.
// @ducanh2912/next-pwa will merge this with the generated worker automatically
// if named 'worker.js'. We keep it as a standalone custom SW that handles push events.

self.addEventListener('push', function (event) {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Misty Visuals', body: event.data.text(), url: '/' }
  }

  const title = data.title || 'Misty Visuals OS'
  const options = {
    body: data.body || data.message || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-96.png',
    data: { url: data.url || '/' },
    vibrate: [150, 50, 150],
    requireInteraction: false,
    tag: data.tag || 'mv-notification',
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // If a window for the app is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
