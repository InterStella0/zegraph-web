'use client'
import { useState, useEffect } from 'react';
import { Bell, BellOff, Server, Globe } from 'lucide-react';
import { Button } from 'components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from 'components/ui/dropdown-menu';
import LoginDialog from 'components/ui/LoginDialog';
import { usePushNotifications } from 'lib/hooks/usePushNotifications';
import { fetchApiUrl } from 'utils/generalUtils';
import { toast } from 'sonner';
import { SteamProfile } from '../../next-auth-steam/steam';

interface MapNotifyButtonProps {
    mapName: string;
    serverId: string;
    user: SteamProfile | null;
    notifySubscriptionType: 'server' | 'all' | null;
    onSubscriptionChange?: (type: 'server' | 'all' | null) => void;
}

type SubscriptionType = 'server' | 'all' | null;

export default function MapNotifyButton({ mapName, serverId, user, notifySubscriptionType, onSubscriptionChange }: MapNotifyButtonProps) {
    const { isSupported, subscription, subscribe, isLoading: pushLoading } = usePushNotifications(user != null);
    const [subscriptionType, setSubscriptionType] = useState<SubscriptionType>(notifySubscriptionType);
    const [loading, setLoading] = useState(false);
    const [loginDialogOpen, setLoginDialogOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Sync with prop when it changes (e.g., after page navigation or data refresh)
    useEffect(() => {
        setSubscriptionType(notifySubscriptionType);
    }, [notifySubscriptionType]);

    const handleButtonClick = () => {
        if (!user) {
            setLoginDialogOpen(true);
            return;
        }
        setDropdownOpen(true);
    };

    const handleSubscribe = async (type: 'server' | 'all') => {
        let subscriptionToUse = subscription;

        if (!subscription) {
            toast.info('Requesting notification permission...');
            subscriptionToUse = await subscribe();

            if (!subscriptionToUse) {
                toast.error('Failed to enable notifications. Please check browser permissions.');
                return;
            }

            toast.success('Notifications enabled!');
        }

        setLoading(true);
        try {
            await fetchApiUrl('/accounts/me/push/map-notify/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    map_name: mapName,
                    server_id: type === 'server' ? serverId : null,
                    subscription_id: subscriptionToUse!.id,
                }),
            });

            // Auto-enable map_specific_enabled preference to ensure notifications work
            try {
                await fetchApiUrl('/accounts/me/push/preferences', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ map_specific_enabled: true }),
                });
            } catch (err) {
                // Non-fatal - subscription already succeeded
                console.warn('Failed to auto-enable map_specific_enabled preference:', err);
            }

            setSubscriptionType(type);
            onSubscriptionChange?.(type);
            const message = type === 'server'
                ? `You'll be notified when ${mapName} plays on this server`
                : `You'll be notified when ${mapName} plays on any server`;
            toast.success(message);
        } catch (error) {
            toast.error('Failed to subscribe to map notification');
            console.error('Subscribe error:', error);
        } finally {
            setLoading(false);
            setDropdownOpen(false);
        }
    };

    const handleUnsubscribe = async () => {
        setLoading(true);
        try {
            const url = subscriptionType === 'server'
                ? `/accounts/me/push/map-notify/${encodeURIComponent(mapName)}?server_id=${encodeURIComponent(serverId)}`
                : `/accounts/me/push/map-notify/${encodeURIComponent(mapName)}`;

            await fetchApiUrl(url, { method: 'DELETE' });

            setSubscriptionType(null);
            onSubscriptionChange?.(null);
            toast.success('Map notification cancelled');
        } catch (error) {
            toast.error('Failed to unsubscribe from map notification');
            console.error('Unsubscribe error:', error);
        } finally {
            setLoading(false);
            setDropdownOpen(false);
        }
    };

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
                        className={`transition-all hover:scale-110 ${isSubscribed ? 'text-primary' : ''}`}
                    >
                        {isSubscribed ? (
                            <Bell className="h-5 w-5 fill-current" />
                        ) : (
                            <Bell className="h-5 w-5" />
                        )}
                    </Button>
                </DropdownMenuTrigger>
                {user && (
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Notify when map plays
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {isSubscribed ? (
                            <DropdownMenuItem
                                onClick={handleUnsubscribe}
                                disabled={loading}
                                className="text-destructive focus:text-destructive"
                            >
                                <BellOff className="mr-2 h-4 w-4" />
                                Cancel Notification
                                <span className="ml-auto text-xs text-muted-foreground">
                                    {subscriptionType === 'server' ? 'This Server' : 'All Servers'}
                                </span>
                            </DropdownMenuItem>
                        ) : (
                            <>
                                <DropdownMenuItem
                                    onClick={() => handleSubscribe('server')}
                                    disabled={loading}
                                >
                                    <Server className="mr-2 h-4 w-4" />
                                    This Server
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => handleSubscribe('all')}
                                    disabled={loading}
                                >
                                    <Globe className="mr-2 h-4 w-4" />
                                    All Servers
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                )}
            </DropdownMenu>
            <LoginDialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} />
        </>
    );
}
