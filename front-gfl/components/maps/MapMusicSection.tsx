'use client'

import {useEffect, useState} from "react";
import { Music, Play, Clock, MoreHorizontal } from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Info } from "lucide-react";
import ErrorCatch from "../ui/ErrorMessage";
import { cn } from "../lib/utils";
import {MapMusicTrack, ServerMapMusic} from "types/maps";
import MapMusicDialog from "./MapMusicDialog";
import {fetchServerUrl} from "utils/generalUtils.ts";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider.tsx";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext.tsx";
import {useTranslations} from 'next-intl';

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function shortenMapMusicBadgeUsage(text: string): string{
    return text.split(".").at(-1) ?? text
}

function TrackCard({
    track,
    onClick
}: {
    track: MapMusicTrack;
    onClick: () => void;
}) {
    return (
        <div
            className={cn(
                "p-3 sm:p-3 rounded-lg border hover:bg-accent/50 active:bg-accent cursor-pointer transition-colors touch-manipulation",
                "flex flex-col gap-2 h-full min-h-[5rem]"
            )}
            onClick={onClick}
        >
            <div className="flex items-start gap-2">
                <div className="p-1.5 sm:p-2 rounded-md bg-primary/10 shrink-0">
                    <Music className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm sm:text-base truncate">{track.title}</p>
                    {track.artist && (
                        <p className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5">
                            {track.artist}
                        </p>
                    )}
                </div>
                <Play className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center justify-between gap-2 mt-auto">
                <div className="flex items-center gap-1 flex-wrap">
                    {track.contexts.slice(0, 1).map((c, i) => (
                        <Badge key={i} className="text-xs max-w-50 lg:max-w-45 max-md:max-w-40">
                            <span className=" truncate ">
                                {shortenMapMusicBadgeUsage(c)}
                            </span>
                        </Badge>
                    ))}
                    {track.contexts.length > 1 && (
                        <Badge variant="secondary" className="text-xs">
                            +{track.contexts.length - 1}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(track.duration)}</span>
                </div>
            </div>
        </div>
    );
}

function MoreTracksCard({
    count,
    onClick
}: {
    count: number;
    onClick: () => void;
}) {
    const t = useTranslations('maps.music');
    return (
        <div
            className={cn(
                "p-3 rounded-lg border hover:bg-accent/50 active:bg-accent cursor-pointer transition-colors touch-manipulation",
                "flex flex-col items-center justify-center h-full gap-2 min-h-[5rem]"
            )}
            onClick={onClick}
        >
            <div className="p-1.5 sm:p-2 rounded-md bg-primary/10">
                <MoreHorizontal className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
                {t('moreCount', {count})}
            </p>
        </div>
    );
}

const TRUNCATE_MUSIC = 3
function MapMusicSectionDisplay() {
    const t = useTranslations('maps.music');
    const { name } = useMapContext()
    const {server} = useServerData()
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);

    const [tracks, setTracks] = useState<MapMusicTrack[]>([]);

    useEffect(() => {
        fetchServerUrl(server.id, `/maps/${name}/musics`)
            .then((musics: ServerMapMusic[]) => {
                return musics.map(music => {
                    // Parse artist and title from "Artist - Title" format
                    const separatorMatch = music.name.match(/\s+[-–—]\s+/);
                    let artist: string | undefined;
                    let title: string;

                    if (separatorMatch && separatorMatch.index !== undefined) {
                        artist = music.name.substring(0, separatorMatch.index).trim();
                        title = music.name.substring(separatorMatch.index + separatorMatch[0].length).trim();
                    } else {
                        // No separator - treat entire name as title
                        title = music.name.trim();
                        artist = undefined;
                    }

                    return {
                        id: music.id,
                        title: title || t('unknownTrack'),
                        artist,
                        duration: music.duration,
                        contexts: music.tags,
                        youtubeVideoId: music.youtube_music,
                        otherMaps: music.other_maps,
                        source: music.source,
                        yt_source: music.yt_source,
                        yt_source_name: music.yt_source_name
                    }
                })
            })
            .then(setTracks)
    }, [server.id, name]);

    if (tracks.length === 0) {
        return null;
    }

    const handleTrackClick = (index: number) => {
        setSelectedTrackIndex(index);
        setDialogOpen(true);
    };

    return (
        <>
            <Card className="p-3 sm:p-4">
                <TooltipProvider>
                    {/* Header */}
                    <div className="flex justify-between items-center mb-3 sm:mb-4">
                        <div className="flex items-center gap-2">
                            <Music className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                            <h2 className="text-base sm:text-lg font-bold text-primary">{t('title')}</h2>
                        </div>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="inline-flex">
                                    <Info className="h-4 w-4 opacity-70" />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{t('tooltip')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>

                    {/* Track grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                        {tracks.slice(0, TRUNCATE_MUSIC).map((track, index) => (
                            <TrackCard
                                key={track.id}
                                track={track}
                                onClick={() => handleTrackClick(index)}
                            />
                        ))}
                        {tracks.length > TRUNCATE_MUSIC && (
                            <MoreTracksCard
                                count={tracks.length - TRUNCATE_MUSIC}
                                onClick={() => handleTrackClick(0)}
                            />
                        )}
                    </div>
                </TooltipProvider>
            </Card>

            <MapMusicDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                tracks={tracks}
                initialTrackIndex={selectedTrackIndex}
            />
        </>
    );
}

export default function MapMusicSection() {
    const t = useTranslations('maps.music');
    return (
        <ErrorCatch message={t('loadError')}>
            <MapMusicSectionDisplay />
        </ErrorCatch>
    );
}
