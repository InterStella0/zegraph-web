'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Switch } from 'components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { usePushNotifications } from 'lib/hooks/usePushNotifications';
import {fetchApiUrl} from 'utils/generalUtils';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface NotificationPreferences {
  user_id: number;
  announcements_enabled: boolean;
  system_enabled: boolean;
  map_specific_enabled: boolean;
}

export default function NotificationSettingsPage(user) {
  const t = useTranslations('settings.notifications');
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
      toast.success(t('preferencesUpdated'));
    } catch (error) {
      console.error('Failed to update preferences:', error);
      toast.error(t('preferencesUpdateFailed'));
    } finally {
      setSavingPreferences(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="container max-w-4xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('notSupported')}</CardTitle>
            <CardDescription>
              {t('notSupportedDesc')}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('pushTitle')}</CardTitle>
          <CardDescription>
            {t('subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable/Disable Notifications */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{t('enablePush')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('receiveBrowser')}
              </p>
            </div>
            {isSubscribed ? (
              <Button
                variant="destructive"
                onClick={unsubscribe}
                disabled={isLoading}
              >
                <BellOff className="mr-2 h-4 w-4" />
                {isLoading ? t('disabling') : t('disable')}
              </Button>
            ) : (
              <Button
                onClick={subscribe}
                disabled={isLoading}
              >
                <Bell className="mr-2 h-4 w-4" />
                {isLoading ? t('enabling') : t('enable')}
              </Button>
            )}
          </div>

          {/* Permission Status */}
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {t('permissionStatus')} <span className="font-medium">{permission}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      {isSubscribed && preferences && (
        <Card>
          <CardHeader>
            <CardTitle>{t('preferencesTitle')}</CardTitle>
            <CardDescription>
              {t('preferencesDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{t('announcements')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('announcementsDesc')}
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
                <h3 className="font-medium">{t('system')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('systemDesc')}
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
                <h3 className="font-medium">{t('mapSpecific')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('mapSpecificDesc')}
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
