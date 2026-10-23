import { useCallback, useEffect, useState } from 'react';
import { fetchApiUrl } from 'utils/generalUtils';
import { sendJson } from 'lib/sendJson';

interface PushSubscriptionInfo {
  id: string;
  endpoint: string;
}

interface NotificationPermissionState {
  permission: NotificationPermission;
  isSubscribed: boolean;
  subscription: PushSubscriptionInfo | null;
  isLoading: boolean;
  error: string | null;
}

export function usePushNotifications(isLogged: boolean) {
  const [state, setState] = useState<NotificationPermissionState>({
    permission: 'default',
    isSubscribed: false,
    subscription: null,
    isLoading: false,
    error: null,
  });
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const update = (patch: Partial<NotificationPermissionState>) => setState(prev => ({ ...prev, ...patch }));

  useEffect(() => {
    setIsSupported('serviceWorker' in navigator && 'PushManager' in window && isLogged);
  }, [isLogged]);

  useEffect(() => {
    if (!isSupported) return;

    (async () => {
      const permission = Notification.permission;
      update({ permission });
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      const browserSubscription = await registration.pushManager.getSubscription();
      if (!browserSubscription) return;
      try {
        const subscriptions: PushSubscriptionInfo[] = await fetchApiUrl('/accounts/me/push/subscriptions');
        const currentSub = subscriptions.find(s => s.endpoint === browserSubscription.endpoint);
        update({ isSubscribed: true, subscription: currentSub || null });
      } catch (error) {
        console.error('Failed to fetch subscriptions:', error);
        update({ isSubscribed: true });
      }
    })().catch(error => console.error('Failed to initialize push notifications:', error));
  }, [isSupported]);

  /** Runs `action` with the loading flag set; on failure records the error and returns `fallback`. */
  const withLoading = async <T,>(label: string, fallback: T, action: () => Promise<T>): Promise<T> => {
    update({ isLoading: true, error: null });
    try {
      return await action();
    } catch (error) {
      console.error(`${label} failed:`, error);
      update({ isLoading: false, error: error instanceof Error ? error.message : `${label} failed` });
      return fallback;
    }
  };

  // Stable callbacks for callers' effects; `update`/`withLoading` only touch setState, so [isSupported] is enough.
  const subscribe = useCallback(async (): Promise<PushSubscriptionInfo | null> => {
    if (!isSupported) {
      update({ error: 'Push notifications not supported' });
      return null;
    }
    return withLoading('Subscription', null, async () => {
      const permission = await Notification.requestPermission();
      update({ permission });
      if (permission !== 'granted') throw new Error('Notification permission denied');

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;

      const vapidKeyData = await fetchApiUrl('/accounts/me/push/vapid-public-key');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKeyData.trim()),
      });
      const backendSubscription: PushSubscriptionInfo = await sendJson('/accounts/me/push/subscribe', 'POST', subscription.toJSON(), { credentials: 'include' });
      update({ isSubscribed: true, subscription: backendSubscription, isLoading: false });
      return backendSubscription;
    });
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return false;
    return withLoading('Unsubscribe', false, async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const subscriptionData = subscription.toJSON();
        await subscription.unsubscribe();
        await sendJson('/accounts/me/push/unsubscribe', 'POST', subscriptionData, { credentials: 'include' });
      }
      update({ isSubscribed: false, subscription: null, isLoading: false });
      return true;
    });
  }, [isSupported]);

  return { ...state, isSupported, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  try {
    const cleanString = base64String.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(cleanString)) {
      throw new Error('VAPID key contains invalid characters');
    }
    const padding = '='.repeat((4 - cleanString.length % 4) % 4);
    const rawData = window.atob((cleanString + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(rawData, char => char.charCodeAt(0));
  } catch (error) {
    throw new Error('Invalid VAPID key format: ' + (error instanceof Error ? error.message : String(error)));
  }
}
