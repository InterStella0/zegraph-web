import {useTranslations} from 'next-intl';
import { Button } from 'components/ui/button';
import { Badge } from 'components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { formatTime } from 'utils/sessionUtils.js';
import dayjs from "dayjs";
import { SessionInfo } from "../../app/servers/[server_slug]/util";
import { Server } from "types/community";
import Image from "next/image";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";

export default function MapSessionHeader(
    { sessionInfo, server, mapImage }:
    { sessionInfo: SessionInfo<"map">, mapImage: string | null, server: Server }
) {
    const t = useTranslations('sessions');
    const ended = sessionInfo ? sessionInfo.ended_at ? formatTime(sessionInfo.ended_at) : ` ${t('ongoing')}` : ''

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button variant="ghost" size="icon" asChild>
                    <HoverPrefetchLink href={`/servers/${server.gotoLink}/maps/${sessionInfo.map}/`}>
                        <ArrowLeft className="h-4 w-4" />
                    </HoverPrefetchLink>
                </Button>

                <div className="flex items-center gap-3 flex-1 min-w-0">
                    {mapImage && (
                        <Image
                            unoptimized
                            src={mapImage}
                            alt={sessionInfo.map}
                            height={80}
                            width={100}
                            className="rounded-lg border flex-shrink-0"
                        />
                    )}
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-semibold truncate max-w-[150px] sm:max-w-[300px]">
                            {sessionInfo.map}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('sessionNumber', {id: sessionInfo.time_id})}
                        </p>
                    </div>
                </div>
            </div>

            <Badge variant="outline" className="sm:ml-auto whitespace-nowrap" suppressHydrationWarning>
                {sessionInfo ? dayjs(sessionInfo.started_at).format("YYYY-MM-DD") : ''} • {sessionInfo ? formatTime(sessionInfo.started_at) : ''}-{ended}
            </Badge>
        </div>
    );
}
