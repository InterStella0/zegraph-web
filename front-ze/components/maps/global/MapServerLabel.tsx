'use client'
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {useServerMap} from "components/ui/ServerProvider";
import {getServerAvatarText} from "components/ui/CommunitySelector";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {cn} from "components/lib/utils";

/** A server as "community · server" with its community avatar, optionally linking to `href`. */
export default function MapServerLabel({ serverId, href, className }: {
    serverId: string,
    href?: string,
    className?: string,
}) {
    const { serversMapped } = useServerMap();
    const server = serversMapped.get(serverId);
    const community = server?.community_name ?? serverId;

    const label = <>
        {/* The server name gives way first, so the community stays readable. */}
        <span className="font-medium truncate shrink-0 max-w-[60%]">{community}</span>
        {server && <span className="text-muted-foreground truncate">· {server.name}</span>}
    </>;

    return (
        <div className={cn("flex items-center gap-1.5 min-w-0 text-xs", className)}>
            <Avatar className="w-4 h-4 shrink-0">
                {server?.community_icon && <AvatarImage src={server.community_icon} alt={community}/>}
                <AvatarFallback className="text-[8px]">
                    {getServerAvatarText(server?.community_shorten_name || community)}
                </AvatarFallback>
            </Avatar>
            {href
                ? <HoverPrefetchLink href={href} className="flex items-center gap-1 min-w-0 hover:text-primary transition-colors">
                    {label}
                </HoverPrefetchLink>
                : <span className="flex items-center gap-1 min-w-0">{label}</span>}
        </div>
    );
}
