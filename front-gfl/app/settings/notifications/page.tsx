'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Switch } from 'components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { usePushNotifications } from 'lib/hooks/usePushNotifications';
import {fetchApiUrl} from 'utils/generalUtils';
import { toast } from 'sonner';

interface NotificationPreferences {
  user_id: number;
  announcements_enabled: boolean;
  system_enabled: boolean;
  map_specific_enabled: boolean;
}

export default function NotificationSettingsPage(user) {
  const { permission, isSubscribed, isSupported, subscribe, unsubscribe, isLoading } = usePushNotifications(user != null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);

  useEffect(() => {
    if (isSubscribed) {
      loadPreferences();
    }
  }, [isSubscribed]);

  const loadPreferences = async () => {
    try {
      const data = await fetchApiUrl('/accounts/me/push/preferences', {
        credentials: 'include',
      });
      setPreferences(data);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  };

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences) return;

    setSavingPreferences(true);
    try {
      const updated = await fetchApiUrl('/accounts/me/push/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [key]: value }),
      });
      setPreferences(updated);
      toast.success('Preferences updated');
    } catch (error) {
      console.error('Failed to update preferences:', error);
      toast.error('Failed to update preferences');
    } finally {
      setSavingPreferences(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="container max-w-4xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Notifications Not Supported</CardTitle>
            <CardDescription>
              Your browser doesn&apos;t support push notifications.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Notification Settings</h1>
        <p className="text-muted-foreground">
          Manage how you receive notifications from ZE Graph
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Push Notifications</CardTitle>
          <CardDescription>
            Manage how you receive notifications from ZE Graph
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable/Disable Notifications */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Enable Push Notifications</h3>
              <p className="text-sm text-muted-foreground">
                Receive browser notifications
              </p>
            </div>
            {isSubscribed ? (
              <Button
                variant="destructive"
                onClick={unsubscribe}
                disabled={isLoading}
              >
                <BellOff className="mr-2 h-4 w-4" />
                {isLoading ? 'Disabling...' : 'Disable'}
              </Button>
            ) : (
              <Button
                onClick={subscribe}
                disabled={isLoading}
              >
                <Bell className="mr-2 h-4 w-4" />
                {isLoading ? 'Enabling...' : 'Enable'}
              </Button>
            )}
          </div>

          {/* Permission Status */}
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Permission status: <span className="font-medium">{permission}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      {isSubscribed && preferences && (
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>
              Choose what types of notifications you want to receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Announcements</h3>
                <p className="text-sm text-muted-foreground">
                  Important site announcements and updates
                </p>
              </div>
              <Switch
                checked={preferences.announcements_enabled}
                onCheckedChange={(checked) => updatePreference('announcements_enabled', checked)}
                disabled={savingPreferences}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">System Notifications</h3>
                <p className="text-sm text-muted-foreground">
                  Server status and system alerts
                </p>
              </div>
              <Switch
                checked={preferences.system_enabled}
                onCheckedChange={(checked) => updatePreference('system_enabled', checked)}
                disabled={savingPreferences}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Map-Specific Notifications</h3>
                <p className="text-sm text-muted-foreground">
                  Get notified when specific maps are played
                </p>
              </div>
              <Switch
                checked={preferences.map_specific_enabled}
                onCheckedChange={(checked) => updatePreference('map_specific_enabled', checked)}
                disabled={savingPreferences}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
