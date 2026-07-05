import {useTranslations} from 'next-intl';
import { Card, CardHeader, CardTitle, CardContent } from 'components/ui/card';
import { Badge } from 'components/ui/badge';
import { formatTime } from 'utils/sessionUtils.js';
import {Server} from "types/community";
import {PlayerSessionMapPlayed} from "../../app/servers/[server_slug]/util";
import dayjs from "dayjs";
import Link from "components/ui/Link.tsx";
import Image from "next/image";


export default function MapsList(
    { maps, mapImages, server }
    : { maps: PlayerSessionMapPlayed[], mapImages: Record<string, string>, server: Server}
){
    const t = useTranslations('sessions');
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('mapsPlayed')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
                {maps.map((map) => {
                    const duration = map.ended_at
                        ? `${dayjs(map.ended_at).diff(dayjs(map.started_at), 'minute')}m`
                        : 'Ongoing';

                    const hasScore = map.match_data && map.match_data.length > 0;
                    const humanWon = hasScore && map.match_data[0].human_score > map.match_data[0].zombie_score;

                    return (
                        <Link
                            key={map.time_id}
                            href={`/servers/${server.gotoLink}/maps/${map.map}/sessions/${map.time_id}`}
                            className="block group"
                        >
                            <div className="border rounded-lg p-4 hover:bg-accent transition-colors">
                                <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                                    {/* Left: Map info and score */}
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                                                {map.map}
                                            </h3>
                                            <span className="text-sm text-muted-foreground">
                                                #{map.time_id}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                            <span>
                                                {formatTime(map.started_at)} - {map.ended_at ? formatTime(map.ended_at) : 'Ongoing'}
                                            </span>
                                            <span>({duration})</span>
                                        </div>

                                        {hasScore ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-bold">
                                                    {map.match_data[0].human_score} - {map.match_data[0].zombie_score}
                                                </span>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                {t('noScoreData')}
                                            </p>
                                        )}
                                    </div>

                                    {/* Right: Map image */}
                                    <div className="flex-shrink-0">
                                        {mapImages[map.map] ? (
                                            <Image
                                                src={mapImages[map.map]}
                                                alt={map.map}
                                                width={120}
                                                height={80}
                                                className="rounded-lg border object-cover"
                                            />
                                        ) : (
                                            <div className="w-[120px] h-[80px] rounded-lg border bg-muted flex items-center justify-center">
                                                <span className="text-xs text-muted-foreground">
                                                    {t('noImage')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </CardContent>
        </Card>
    );
};
