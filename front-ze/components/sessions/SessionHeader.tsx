import {ReactNode} from "react";
import {useTranslations} from 'next-intl';
import { Button } from 'components/ui/button';
import { Badge } from 'components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { PlayerAvatar } from "../players/PlayerAvatar";
import { formatTime } from 'utils/sessionUtils.js';
import {Server} from "types/community";
import {PlayerInfo} from "../../app/servers/[server_slug]/players/[player_id]/util";
import {PlayerSession} from "types/players";
import dayjs from "dayjs";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import Link from "components/ui/Link.tsx";

dayjs.extend(LocalizedFormat)

export function SessionHeaderShell({ back, media, title, subtitle, badge }: {
    back: ReactNode, media: ReactNode, title: ReactNode, subtitle: ReactNode, badge: ReactNode,
}) {
    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button variant="ghost" size="icon" asChild>
                    {back}
                </Button>

                <div className="flex items-center gap-3 flex-1 min-w-0">
                    {media}
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-semibold truncate max-w-[150px] sm:max-w-[300px]">
                            {title}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {subtitle}
                        </p>
                    </div>
                </div>
            </div>

            <Badge
                variant="outline"
                className="sm:ml-auto whitespace-nowrap"
                suppressHydrationWarning
            >
                {badge}
            </Badge>
        </div>
    );
}

export const SessionHeader = (
    { server, player, sessionInfo }
    : { server: Server; player: PlayerInfo; sessionInfo: PlayerSession }

) => {
    const t = useTranslations('sessions');
    const ended = sessionInfo.ended_at ? formatTime(sessionInfo.ended_at) : t('now');

    return <SessionHeaderShell
        back={<Link href={`/servers/${server.gotoLink}/players/${player.id}/`}><ArrowLeft className="h-4 w-4" /></Link>}
        media={<PlayerAvatar uuid={player.id} name={player.name} />}
        title={t('playerSession', {name: player.name})}
        subtitle={t('sessionNumber', {id: sessionInfo.id})}
        badge={<>{dayjs(sessionInfo.started_at).format('LL')} • {formatTime(sessionInfo.started_at)}-{ended}</>}
    />;
};
