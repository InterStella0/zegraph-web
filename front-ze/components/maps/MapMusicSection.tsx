'use client'

import {ReactNode, Suspense, use, useMemo, useState} from "react";
import { Music, Play, Clock, MoreHorizontal } from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import ErrorCatch from "../ui/ErrorMessage";
import { cn } from "../lib/utils";
import {MapMusicTrack, ServerMapMusic} from "types/maps";
import MapMusicDialog from "./MapMusicDialog";
import {InfoHint} from "./MapCardTitle";
import {useTranslations} from 'next-intl';
import {formatTrackDuration} from "utils/format";

const TRUNCATE_MUSIC = 3
const ICON_BOX = "p-1.5 sm:p-2 rounded-md bg-primary/10"

function splitTrackName(name: string): { artist?: string, title: string } {
    const separator = name.match(/\s+[-–—]\s+/);
    if (separator?.index === undefined) return { title: name.trim() };
    return {
        artist: name.substring(0, separator.index).trim(),
        title: name.substring(separator.index + separator[0].length).trim(),
    };
}

function TrackTile({ onClick, className, children }: { onClick: () => void, className?: string, children: ReactNode }) {
    return (
        <div
            className={cn(
                "p-3 rounded-lg border hover:bg-accent/50 active:bg-accent cursor-pointer transition-colors touch-manipulation",
                "flex flex-col gap-2 h-full min-h-[5rem]",
                className,
            )}
            onClick={onClick}
        >
            {children}
        </div>
    );
}

function TrackCard({ track, onClick }: { track: MapMusicTrack, onClick: () => void }) {
    return (
        <TrackTile onClick={onClick}>
            <div className="flex items-start gap-2">
                <div className={cn(ICON_BOX, "shrink-0")}>
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
                    {track.contexts.length > 0 && (
                        <Badge className="text-xs max-w-50 lg:max-w-45 max-md:max-w-40">
                            <span className=" truncate ">
                                {track.contexts[0].split(".").at(-1)}
                            </span>
                        </Badge>
                    )}
                    {track.contexts.length > 1 && (
                        <Badge variant="secondary" className="text-xs">
                            +{track.contexts.length - 1}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    <span>{formatTrackDuration(track.duration)}</span>
                </div>
            </div>
        </TrackTile>
    );
}

function MapMusicSectionDisplay({ musicsPromise }: { musicsPromise: Promise<ServerMapMusic[]> }) {
    const t = useTranslations('maps.music');
    const musics = use(musicsPromise);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);

    const tracks = useMemo<MapMusicTrack[]>(() => musics.map(music => {
        const { artist, title } = splitTrackName(music.name);
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
    }), [musics, t]);

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
                <div className="flex justify-between items-center mb-3 sm:mb-4">
                    <div className="flex items-center gap-2">
                        <Music className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                        <h2 className="text-base sm:text-lg font-bold text-primary">{t('title')}</h2>
                    </div>
                    <InfoHint text={t('tooltip')} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                    {tracks.slice(0, TRUNCATE_MUSIC).map((track, index) => (
                        <TrackCard
                            key={track.id}
                            track={track}
                            onClick={() => handleTrackClick(index)}
                        />
                    ))}
                    {tracks.length > TRUNCATE_MUSIC && (
                        <TrackTile onClick={() => handleTrackClick(0)} className="items-center justify-center">
                            <div className={ICON_BOX}>
                                <MoreHorizontal className="h-4 w-4 text-primary" />
                            </div>
                            <p className="text-sm font-medium text-muted-foreground">
                                {t('moreCount', {count: tracks.length - TRUNCATE_MUSIC})}
                            </p>
                        </TrackTile>
                    )}
                </div>
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

export default function MapMusicSection({ musicsPromise }: { musicsPromise: Promise<ServerMapMusic[]> }) {
    const t = useTranslations('maps.music');
    return (
        <ErrorCatch message={t('loadError')}>
            <Suspense fallback={null}>
                <MapMusicSectionDisplay musicsPromise={musicsPromise} />
            </Suspense>
        </ErrorCatch>
    );
}
