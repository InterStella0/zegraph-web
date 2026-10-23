'use client';

import { ReactNode, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Switch } from 'components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { Skeleton } from 'components/ui/skeleton';
import { usePushNotifications } from 'lib/hooks/usePushNotifications';
import { useResource } from 'lib/hooks/useResource';
import {fetchApiUrl} from 'utils/generalUtils';
import { sendJson } from 'lib/sendJson';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface NotificationPreferences {
  user_id: number;
  announcements_enabled: boolean;
  system_enabled: boolean;
  map_specific_enabled: boolean;
}

const PREFERENCE_TOGGLES = [
  { key: 'announcements_enabled', label: 'announcements' },
  { key: 'system_enabled', label: 'system' },
  { key: 'map_specific_enabled', label: 'mapSpecific' },
] as const;

const PREFERENCES_ENDPOINT = '/accounts/me/push/preferences';

function SettingRow({ title, description, children }: { title: string, description: string, children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default function NotificationSettingsPage() {
  const t = useTranslations('settings.notifications');
  const { permission, isSubscribed, isSupported, subscribe, unsubscribe, isLoading } = usePushNotifications(true);
  const { data: preferences, setData: setPreferences } = useResource<NotificationPreferences>(
    signal => isSubscribed ? fetchApiUrl(PREFERENCES_ENDPOINT, { credentials: 'include', signal }) : null,
    [isSubscribed],
    { keepData: true, errorLog: 'Failed to load preferences:' },
  );
  const [savingPreferences, setSavingPreferences] = useState(false);

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences) return;

    setSavingPreferences(true);
    try {
      setPreferences(await sendJson(PREFERENCES_ENDPOINT, 'PUT', { [key]: value }, { credentials: 'include' }));
      toast.success(t('preferencesUpdated'));
    } catch (error) {
      console.error('Failed to update preferences:', error);
      toast.error(t('preferencesUpdateFailed'));
    } finally {
      setSavingPreferences(false);
    }
  };

  if (isSupported === false) {
    return (
      <div className="container max-w-4xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('notSupported')}</CardTitle>
            <CardDescription>{t('notSupportedDesc')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {isSupported === null ? <Skeleton className="h-48 w-full rounded-xl" /> : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('pushTitle')}</CardTitle>
              <CardDescription>{t('subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow title={t('enablePush')} description={t('receiveBrowser')}>
                {isSubscribed ? (
                  <Button variant="destructive" onClick={unsubscribe} disabled={isLoading}>
                    <BellOff className="mr-2 h-4 w-4" />
                    {isLoading ? t('disabling') : t('disable')}
                  </Button>
                ) : (
                  <Button onClick={subscribe} disabled={isLoading}>
                    <Bell className="mr-2 h-4 w-4" />
                    {isLoading ? t('enabling') : t('enable')}
                  </Button>
                )}
              </SettingRow>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  {t('permissionStatus')} <span className="font-medium">{permission}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {isSubscribed && preferences && (
            <Card>
              <CardHeader>
                <CardTitle>{t('preferencesTitle')}</CardTitle>
                <CardDescription>{t('preferencesDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {PREFERENCE_TOGGLES.map(({ key, label }) => (
                  <SettingRow key={key} title={t(label)} description={t(`${label}Desc`)}>
                    <Switch
                      checked={preferences[key]}
                      onCheckedChange={(checked) => updatePreference(key, checked)}
                      disabled={savingPreferences}
                    />
                  </SettingRow>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
