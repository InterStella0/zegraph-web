'use client';

import { ProfileResponse, UserAnonymization } from "types/community";
import CommunityConnectionCard from "./CommunityConnectionCard";
import { useState, useCallback, useOptimistic, startTransition, use } from "react";
import { useTranslations } from "next-intl";
import { fetchApiUrl } from "utils/generalUtils";
import { Separator } from "components/ui/separator";

interface UserCommunityConnectionsProps {
    profilePromise: Promise<ProfileResponse>;
}

export default function UserCommunityConnections({
    profilePromise
}: UserCommunityConnectionsProps)  {
    const t = useTranslations('players.profile.communities');
    const profile = use(profilePromise);
    const { communities, is_owner: isOwner, anonymization } = profile;

    const initialSettings = new Map<string, UserAnonymization>();
    (anonymization ?? []).forEach(setting => {
        if (setting.community_id) initialSettings.set(setting.community_id, setting);
    });

    const [anonymizedCommunities, setAnonymizedCommunities] = useState<Map<string, UserAnonymization>>(initialSettings);
    const [anonymizedOptimisticCommunities, addOptimisticAnonymizedCommunities] = useOptimistic<Map<string, UserAnonymization>, UserAnonymization>(
        anonymizedCommunities,
        (currentState, optimisticValue) => {
            const newState = new Map(currentState);
            newState.set(optimisticValue.community_id!, optimisticValue)
            return newState;
        }
    );

    const handleToggleAnonymize = useCallback(async (communityId: string | number, type: "location" | "anonymous", value: boolean, settings: UserAnonymization | null) => {
        try {
            let body: {community_id: string, anonymize?: boolean, hide_location?: boolean} = {
                community_id: communityId.toString(),
            }
            if (type === "location"){
                body["hide_location"] = value
                body["anonymize"] = settings?.anonymized ?? false
            }
            if (type === "anonymous"){
                body['anonymize'] = value
                if (value)
                    body["hide_location"] = value
                else
                    body["hide_location"] = settings?.hide_location ?? false
            }
            startTransition(() => {
                addOptimisticAnonymizedCommunities({
                    user_id: 0,
                    community_id: communityId.toString(),
                    anonymized: body.anonymize!,
                    hide_location: body.hide_location!
                })
            })
            const data: UserAnonymization = await fetchApiUrl('/users/anonymize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body)
            });
            startTransition(() => {
                setAnonymizedCommunities(prev => {
                    const newMap = new Map(prev);
                    newMap.set(data.community_id!, data)
                    return newMap;
                });
            })
        } catch (error) {
            console.error('Failed to update anonymization setting:', error);
        }
    }, [addOptimisticAnonymizedCommunities]);

    if (!communities || communities.length === 0) {
        return (
            <div className="w-full">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 mt-8">
                    <h2 className="text-2xl font-semibold tracking-tight">
                        {t('heading')}
                    </h2>
                </div>
                <Separator className="mb-6" />
                <div className="text-center py-8">
                    <p className="text-muted-foreground">
                        {t('empty')}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 mt-8">
                <h2 className="text-2xl font-semibold tracking-tight">
                    {t('heading')}
                </h2>
            </div>
            <Separator className="mb-6" />
            <div className="space-y-4">
                {communities.map((community) => {
                    const settings = anonymizedOptimisticCommunities.get(community.id)
                    return <CommunityConnectionCard
                        key={community.id}
                        community={community}
                        settings={settings ?? null}
                        onToggleAnonymize={handleToggleAnonymize}
                        showAnonymizeToggle={isOwner}
                    />
                })}
            </div>
        </div>
    );
}
