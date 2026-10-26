'use client'
import {createContext, ReactNode, use, useContext, useEffect, useState} from "react";
import {Community} from "types/community";
import {CommunitiesData, getCommunity} from "../../app/getCommunity";
import {NO_CACHE} from "utils/generalUtils";

const ServerProvider = createContext<CommunitiesData>(null)

export function useServerMap() {
    return useContext(ServerProvider);
}

export function CommunityServerProvider({ promiseCommunities, children }: {promiseCommunities: Promise<Community[]>, children: ReactNode}) {
    const initialData = use(promiseCommunities);
    const [communities, setCommunities] = useState(initialData);

    useEffect(() => {
        // The page renders from the backend directly, but browser polls go through nginx's API cache, which
        // would keep serving the same counts for minutes. getCommunity swallows failures into an empty list,
        // so keep the last counts rather than blanking every server list until the next poll.
        const interval = setInterval(() => getCommunity(NO_CACHE).then(fresh => fresh.length > 0 && setCommunities(fresh)), 60_000);
        return () => clearInterval(interval);
    }, []);
    return <ServerProvider.Provider value={new CommunitiesData(communities)}>
        {children}
    </ServerProvider.Provider>
}
export default ServerProvider;
