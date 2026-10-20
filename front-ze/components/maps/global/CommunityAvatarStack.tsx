'use client'
import {useTranslations} from 'next-intl';
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {useServerMap} from "components/ui/ServerProvider";
import {getServerAvatarText} from "components/ui/CommunitySelector";
import {GlobalMapServer} from "types/maps.ts";
import {Server} from "types/community.ts";

const MAX_AVATARS = 5;

export default function CommunityAvatarStack({ servers, countClassName = 'text-muted-foreground' }: {
    servers: GlobalMapServer[],
    countClassName?: string,
}) {
    const t = useTranslations('maps.global');
    const { serversMapped } = useServerMap();

    const known = servers
        .map(entry => serversMapped.get(entry.server_id))
        .filter((server): server is Server => server != null);
    const communities = new Map<string, Server>();
    for (const server of known) {
        if (!communities.has(server.community_id)) communities.set(server.community_id, server);
    }
    const shown = [...communities.values()].slice(0, MAX_AVATARS);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex items-center gap-2 cursor-default">
                    {/* Side by side rather than overlapped: --card is translucent, so a card-coloured
                        cutout ring shows up as a dark frame instead of separating the icons. */}
                    <div className="flex gap-1">
                        {shown.map(server => (
                            <Avatar key={server.community_id} className="w-6 h-6 rounded-md">
                                {server.community_icon && (
                                    <AvatarImage src={server.community_icon} alt={server.community_name}/>
                                )}
                                <AvatarFallback className="text-[9px]">
                                    {getServerAvatarText(server.community_shorten_name || server.community_name)}
                                </AvatarFallback>
                            </Avatar>
                        ))}
                    </div>
                    <span className={`text-xs whitespace-nowrap ${countClassName}`}>
                        {t('serversCount', {count: servers.length})}
                    </span>
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <ul className="space-y-0.5">
                    {known.map(server => (
                        <li key={server.id}>
                            <span className="font-medium">{server.community_name}</span>
                            <span className="text-muted-foreground"> · {server.name}</span>
                        </li>
                    ))}
                </ul>
            </TooltipContent>
        </Tooltip>
    );
}
