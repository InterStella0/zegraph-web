'use client';

import { useState, useEffect, use } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from 'components/ui/button';
import { usePushNotifications } from 'lib/hooks/usePushNotifications';
import { SteamProfile } from '../../next-auth-steam/steam';

interface NotificationBannerProps {
  userPromise: Promise<SteamProfile | null>;
}

export function NotificationBanner({ userPromise }: NotificationBannerProps) {
  const user = use(userPromise);
  const { permission, isSubscribed, isSupported, subscribe, isLoading } = usePushNotifications(user != null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user previously dismissed the banner
    const wasDismissed = localStorage.getItem('notification-banner-dismissed');
    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('notification-banner-dismissed', 'true');
  };

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setDismissed(true);
      localStorage.setItem('notification-banner-dismissed', 'true');
    }
  };

  // Don't show banner if:
  // - Not supported
  // - User not logged in
  // - Permission already granted and subscribed
  // - User dismissed
  if (!isSupported || !user || dismissed || (permission === 'granted' && isSubscribed)) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-md bg-card border border-border rounded-lg shadow-lg p-4 z-50">
      <div className="flex items-start gap-3">
        <Bell className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">Enable Notifications</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Get notified about important announcements and updates. You can manage this in settings.
          </p>
          <div className="flex gap-2 mt-2 ">
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={isLoading}
            >
              {isLoading ? 'Enabling...' : 'Enable'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDismiss}>
              Not now
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
