import { useEffect, useState, useCallback } from 'react';
import { fetchApiUrl } from 'utils/generalUtils';
import { MapNotifySubscription } from 'types/maps';

interface UseMapNotificationsResult {
    subscriptions: MapNotifySubscription[];
    isLoading: boolean;
    error: string | null;
    getSubscriptionType: (mapName: string, serverId: string) => 'server' | 'all' | null;
    refresh: () => Promise<void>;
}

export function useMapNotifications(isLoggedIn: boolean): UseMapNotificationsResult {
    const [subscriptions, setSubscriptions] = useState<MapNotifySubscription[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSubscriptions = useCallback(async () => {
        if (!isLoggedIn) {
            setSubscriptions([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const data: MapNotifySubscription[] = await fetchApiUrl('/accounts/me/push/map-notify');
            setSubscriptions(data);
        } catch (err) {
            console.error('Failed to fetch map notifications:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch subscriptions');
            setSubscriptions([]);
        } finally {
            setIsLoading(false);
        }
    }, [isLoggedIn]);

    useEffect(() => {
        fetchSubscriptions();
    }, [fetchSubscriptions]);

    const getSubscriptionType = useCallback((mapName: string, serverId: string): 'server' | 'all' | null => {
        // Find a subscription for this map
        // Prefer server-specific subscription over all-servers subscription
        const serverSub = subscriptions.find(
            sub => sub.map_name === mapName && sub.server_id === serverId && !sub.triggered
        );
        if (serverSub) {
            return 'server';
        }

        const allServersSub = subscriptions.find(
            sub => sub.map_name === mapName && sub.server_id === null && !sub.triggered
        );
        if (allServersSub) {
            return 'all';
        }

        return null;
    }, [subscriptions]);

    return {
        subscriptions,
        isLoading,
        error,
        getSubscriptionType,
        refresh: fetchSubscriptions,
    };
}
