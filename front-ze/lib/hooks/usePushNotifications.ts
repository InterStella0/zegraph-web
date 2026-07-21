import { useEffect, useState, useCallback } from 'react';
import { fetchApiUrl } from 'utils/generalUtils';

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

  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      isLogged
    );
  }, [isLogged]);

  useEffect(() => {
    if (!isSupported) return;

    const init = async () => {
      try {
        const permission = Notification.permission;
        setState(prev => ({ ...prev, permission }));

        if (permission === 'granted') {
          const registration = await navigator.serviceWorker.ready;
          const browserSubscription = await registration.pushManager.getSubscription();

          if (browserSubscription) {
            try {
              const subscriptions: Array<{ id: string; endpoint: string }> = await fetchApiUrl('/accounts/me/push/subscriptions');
              const currentSub = subscriptions.find(s => s.endpoint === browserSubscription.endpoint);
              setState(prev => ({
                ...prev,
                isSubscribed: true,
                subscription: currentSub || null
              }));
            } catch (error) {
              console.error('Failed to fetch subscriptions:', error);
              setState(prev => ({ ...prev, isSubscribed: true }));
            }
          }
        }
      } catch (error) {
        console.error('Failed to initialize push notifications:', error);
      }
    };

    init();
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<PushSubscriptionInfo | null> => {
    if (!isSupported) {
      setState(prev => ({ ...prev, error: 'Push notifications not supported' }));
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission }));

      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      await navigator.serviceWorker.ready;

      const vapidKeyData = await fetchApiUrl('/accounts/me/push/vapid-public-key');
      const vapidPublicKey = vapidKeyData.trim();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subscriptionData = subscription.toJSON();
      const backendSubscription: { id: string; endpoint: string } = await fetchApiUrl('/accounts/me/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(subscriptionData),
      });

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        subscription: backendSubscription,
        isLoading: false
      }));
      return backendSubscription;
    } catch (error) {
      console.error('Subscription failed:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Subscription failed'
      }));
      return null;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return false;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const subscriptionData = subscription.toJSON();
        await subscription.unsubscribe();
        await fetchApiUrl('/accounts/me/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(subscriptionData),
        });
      }

      setState(prev => ({ ...prev, isSubscribed: false, subscription: null, isLoading: false }));
      return true;
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unsubscribe failed'
      }));
      return false;
    }
  }, [isSupported]);

  return {
    ...state,
    isSupported,
    subscribe,
    unsubscribe,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  try {
    const cleanString = base64String.trim();

    if (!/^[A-Za-z0-9_-]+$/.test(cleanString)) {
      throw new Error('VAPID key contains invalid characters');
    }

    const padding = '='.repeat((4 - cleanString.length % 4) % 4);
    const base64 = (cleanString + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  } catch (error) {
    throw new Error('Invalid VAPID key format: ' + (error instanceof Error ? error.message : String(error)));
  }
}
