'use client'
import {createContext, ReactNode, use, useContext, useEffect, useState} from "react";
import {Community} from "types/community";
import {CommunitiesData, getCommunity} from "../../app/getCommunity";

const ServerProvider = createContext<CommunitiesData>(null)

export function useServerMap() {
    return useContext(ServerProvider);
}


export function CommunityServerProvider({ promiseCommunities, children }: {promiseCommunities: Promise<Community[]>, children: ReactNode}) {
    const initialData = use(promiseCommunities);
    const [communities, setCommunities] = useState(initialData);

    useEffect(() => {
        const refresh = async () => {
            try {
                await getCommunity().then(setCommunities);
            } catch (err) {
                console.error('Failed to refresh communities:', err);
            }
        };

        const interval = setInterval(refresh, 60_000);
        return () => clearInterval(interval);
    }, []);
    return <ServerProvider.Provider value={new CommunitiesData(communities)}>
        {children}
    </ServerProvider.Provider>
}
export default ServerProvider;
