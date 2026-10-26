'use client'
import { useState, useEffect } from 'react';
import { Bell, BellOff, Server, Globe } from 'lucide-react';
import { Button } from 'components/ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import {useLoginDialog} from 'components/ui/LoginDialog';
import { usePushNotifications } from 'lib/hooks/usePushNotifications';
import { fetchApiUrl } from 'utils/generalUtils';
import { sendJson } from 'lib/sendJson';
import { toast } from 'sonner';
import { SteamProfile } from 'types/steam';
import {useTranslations} from 'next-intl';
import {cn} from 'components/lib/utils';
import {toastRequest, ToastMessages} from 'components/maps/toastRequest';

type SubscriptionType = 'server' | 'all' | null;

interface MapNotifyButtonProps {
    mapName: string;
    serverId: string;
    user: SteamProfile | null;
    notifySubscriptionType: SubscriptionType;
    onSubscriptionChange?: (type: SubscriptionType) => void;
}

export default function MapNotifyButton({ mapName, serverId, user, notifySubscriptionType, onSubscriptionChange }: MapNotifyButtonProps) {
    const t = useTranslations('maps.notify');
    const { isSupported, subscription, subscribe, isLoading: pushLoading } = usePushNotifications(user != null);
    const [subscriptionType, setSubscriptionType] = useState<SubscriptionType>(notifySubscriptionType);
    const [loading, setLoading] = useState(false);
    const {openLogin, loginDialog} = useLoginDialog();
    const [dropdownOpen, setDropdownOpen] = useState(false);

    useEffect(() => {
        setSubscriptionType(notifySubscriptionType);
    }, [notifySubscriptionType]);

    const handleButtonClick = () => {
        if (!user) {
            openLogin();
            return;
        }
        setDropdownOpen(true);
    };

    const update = async (request: () => Promise<unknown>, type: SubscriptionType, messages: ToastMessages) => {
        setLoading(true);
        await toastRequest(async () => {
            await request();
            setSubscriptionType(type);
            onSubscriptionChange?.(type);
        }, messages);
        setLoading(false);
        setDropdownOpen(false);
    };

    const handleSubscribe = async (type: 'server' | 'all') => {
        let subscriptionToUse = subscription;

        if (!subscription) {
            toast.info(t('requestingPermission'));
            subscriptionToUse = await subscribe();

            if (!subscriptionToUse) {
                toast.error(t('enableFailed'));
                return;
            }

            toast.success(t('enabled'));
        }

        await update(async () => {
            await sendJson('/accounts/me/push/map-notify/subscribe', 'POST', {
                map_name: mapName,
                server_id: type === 'server' ? serverId : null,
                subscription_id: subscriptionToUse!.id,
            });
            await sendJson('/accounts/me/push/preferences', 'PUT', { map_specific_enabled: true })
                .catch(err => console.warn('Failed to auto-enable map_specific_enabled preference:', err));
        }, type, {
            success: type === 'server' ? t('subscribedServer', {mapName}) : t('subscribedAll', {mapName}),
            failure: t('subscribeFailed'),
            log: 'Subscribe error:',
        });
    };

    const handleUnsubscribe = () => update(() => {
        const serverQuery = subscriptionType === 'server' ? `?server_id=${encodeURIComponent(serverId)}` : '';
        return fetchApiUrl(`/accounts/me/push/map-notify/${encodeURIComponent(mapName)}${serverQuery}`, { method: 'DELETE' });
    }, null, { success: t('cancelled'), failure: t('unsubscribeFailed'), log: 'Unsubscribe error:' });

    if (!isSupported) {
        return null;
    }

    const isSubscribed = subscriptionType !== null;

    return (
        <>
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleButtonClick}
                        disabled={loading || pushLoading}
                        className={cn("transition-all hover:scale-110", isSubscribed && 'text-primary')}
                    >
                        <Bell className={cn("h-5 w-5", isSubscribed && "fill-current")} />
                    </Button>
                </DropdownMenuTrigger>
                {user && (
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                            {t('notifyWhenPlays')}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {isSubscribed ? (
                            <DropdownMenuItem
                                onClick={handleUnsubscribe}
                                disabled={loading}
                                className="text-destructive focus:text-destructive"
                            >
                                <BellOff className="mr-2 h-4 w-4" />
                                {t('cancelNotification')}
                                <span className="ml-auto text-xs text-muted-foreground">
                                    {subscriptionType === 'server' ? t('thisServer') : t('allServers')}
                                </span>
                            </DropdownMenuItem>
                        ) : (
                            <>
                                <DropdownMenuItem onClick={() => handleSubscribe('server')} disabled={loading}>
                                    <Server className="mr-2 h-4 w-4" />
                                    {t('thisServer')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSubscribe('all')} disabled={loading}>
                                    <Globe className="mr-2 h-4 w-4" />
                                    {t('allServers')}
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                )}
            </DropdownMenu>
            {loginDialog}
        </>
    );
}
