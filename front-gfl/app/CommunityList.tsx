'use client';

import {ReactElement, useEffect, useMemo, useState, use} from 'react';
import {Skeleton} from "components/ui/skeleton";
import {Gamepad2} from 'lucide-react';
import CommunityServerGroup from "components/home/CommunityServerGroup";
import {simpleRandom} from "utils/generalUtils.ts";
import {Community} from "types/community.ts";
import {useTranslations} from "next-intl";

export function CommunityListLoading() {
    const [isClient, setIsClient] = useState(false);
    useEffect(() => {
        setIsClient(true);
    })
    const amount = simpleRandom(3, 6, isClient)
    return <div className="flex flex-col gap-3">
        {Array.from({length: amount}).map((_, i) => (
            <Skeleton key={i} className="h-[160px] w-full rounded-lg" />
        ))}
    </div>
}


export default function CommunityList({ communitiesDataPromise }: { communitiesDataPromise: Promise<Community[]>}): ReactElement {
    const communities = use(communitiesDataPromise);
    const t = useTranslations('home');
    const serverCount = useMemo(
        () => communities.reduce((sum, c) => sum + c.servers.length, 0),
        [communities],
    );

    return <>
        <div className="flex flex-row items-baseline gap-3 mb-3">
            <h2 className="text-2xl font-bold">{t('title')}</h2>
            {communities.length > 0 && (
                <span className="text-sm text-muted-foreground">
                    {serverCount} {serverCount === 1 ? 'server' : 'servers'} · {communities.length}{' '}
                    {communities.length === 1 ? 'community' : 'communities'}
                </span>
            )}
        </div>

        <div className="flex flex-col gap-3">
            {communities.map((community) => (
                <CommunityServerGroup key={community.id} community={community} />
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
