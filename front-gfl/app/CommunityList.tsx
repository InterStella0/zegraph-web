'use client';

import {ReactElement, Suspense, use, useEffect, useState} from 'react';
import {Skeleton} from "components/ui/skeleton";
import {Gamepad2} from 'lucide-react';
import CommunityCard from "components/communities/CommunityCard";
import {simpleRandom} from "utils/generalUtils.ts";
import {Community} from "types/community.ts";

export function CommunityListLoading() {
    const [isClient, setIsClient] = useState(false);
    useEffect(() => {
        setIsClient(true);
    })
    const amount = simpleRandom(4, 8, isClient)
    return <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
        {Array.from({length: amount}).map((_, i) => (
            <Skeleton key={i} className="h-[258px] w-full rounded-lg" />
        ))}
    </div>
}


export default function CommunityList({ communitiesDataPromise }: { communitiesDataPromise: Promise<Community[]>}): ReactElement {
    const communities = use(communitiesDataPromise);
    return <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
            {communities.map((community) => (
                <div key={community.id}>
                    <CommunityCard community={community} />
                </div>
            ))}
        </div>

        {communities.length === 0 && (
            <div className="text-center py-8">
                <Gamepad2
                    className="text-[48px] sm:text-[64px] mb-2 mx-auto"
                    size={64}
                />
                <h5 className="text-2xl sm:text-[2.125rem] font-medium mb-2">
                    No communities found
                </h5>
                <p className="text-sm sm:text-base text-muted-foreground">
                    Looks like all the gamers are taking a break! 🎮
                </p>
            </div>
        )}
    </>
}