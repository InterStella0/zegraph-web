import {useTranslations} from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { formatTime } from 'utils/sessionUtils.js';
import dayjs from "dayjs";
import { SessionInfo } from "../../app/servers/[server_slug]/util";
import { Server } from "types/community";
import Image from "next/image";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {SessionHeaderShell} from "./SessionHeader";

export default function MapSessionHeader(
    { sessionInfo, server, mapImage }:
    { sessionInfo: SessionInfo<"map">, mapImage: string | null, server: Server }
) {
    const t = useTranslations('sessions');
    const ended = sessionInfo ? sessionInfo.ended_at ? formatTime(sessionInfo.ended_at) : ` ${t('ongoing')}` : ''

    return <SessionHeaderShell
        back={<HoverPrefetchLink href={`/servers/${server.gotoLink}/maps/${sessionInfo.map}/`}><ArrowLeft className="h-4 w-4" /></HoverPrefetchLink>}
        media={mapImage && (
            <Image
                unoptimized
                src={mapImage}
                alt={sessionInfo.map}
                height={80}
                width={100}
                className="rounded-lg border flex-shrink-0"
            />
        )}
        title={sessionInfo.map}
        subtitle={t('sessionNumber', {id: sessionInfo.time_id})}
        badge={<>{sessionInfo ? dayjs(sessionInfo.started_at).format("YYYY-MM-DD") : ''} • {sessionInfo ? formatTime(sessionInfo.started_at) : ''}-{ended}</>}
    />;
}
