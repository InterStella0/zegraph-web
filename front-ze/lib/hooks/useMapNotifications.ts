import { useState } from 'react';
import { fetchApiUrl } from 'utils/generalUtils';
import { MapNotifySubscription } from 'types/maps';
import { useResource } from './useResource';

export function useMapNotifications(isLoggedIn: boolean) {
    const [version, setVersion] = useState(0);
    const { data: subscriptions } = useResource<MapNotifySubscription[]>(
        signal => isLoggedIn ? fetchApiUrl('/accounts/me/push/map-notify', { signal }) : null,
        [isLoggedIn, version],
        { keepData: true, errorLog: 'Failed to fetch map notifications:' },
    );

    const getSubscriptionType = (mapName: string, serverId: string): 'server' | 'all' | null => {
        const active = (subscriptions ?? []).filter(sub => sub.map_name === mapName && !sub.triggered);
        if (active.some(sub => sub.server_id === serverId)) return 'server';
        if (active.some(sub => sub.server_id === null)) return 'all';
        return null;
    };

    return { getSubscriptionType, refresh: () => setVersion(v => v + 1) };
}
