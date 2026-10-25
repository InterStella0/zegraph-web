'use client'
import {createContext, ReactNode, use, useContext, useEffect, useState} from "react";
import {Community} from "types/community";
import {CommunitiesData, getCommunity} from "../../app/getCommunity";

const ServerProvider = createContext<CommunitiesData>(null)
const REFRESH_MS = 60_000;
// The page itself renders from the backend directly, but browser polls go through nginx's API cache,
// which would otherwise keep serving the same counts for minutes. no-cache makes nginx skip it.
const NO_CACHE = { cache: "no-store", headers: { "Cache-Control": "no-cache" } } as const;

export function useServerMap() {
    return useContext(ServerProvider);
}


export function CommunityServerProvider({ promiseCommunities, children }: {promiseCommunities: Promise<Community[]>, children: ReactNode}) {
    const initialData = use(promiseCommunities);
    const [communities, setCommunities] = useState(initialData);

    useEffect(() => {
        const refresh = async () => {
            // getCommunity swallows failures into an empty list; keep the last counts rather than
            // blanking every server list until the next poll.
            const fresh = await getCommunity(NO_CACHE);
            if (fresh.length > 0) setCommunities(fresh);
        };

        const interval = setInterval(refresh, REFRESH_MS);
        return () => clearInterval(interval);
    }, []);
    return <ServerProvider.Provider value={new CommunitiesData(communities)}>
        {children}
    </ServerProvider.Provider>
}
export default ServerProvider;
