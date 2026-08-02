'use client';

import { ProfileRecentSession } from "types/community";
import { useTranslations } from "next-intl";
import dayjs from "dayjs";
import { secondsToHours } from "utils/generalUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";

const CELLS = 7;

interface ServerSessionStripProps {
    sessions: ProfileRecentSession[];
    /** Duration in seconds that saturates a cell — profile-wide, so rows stay comparable. */
    scaleMax: number;
}

export default function ServerSessionStrip({ sessions, scaleMax }: ServerSessionStripProps) {
    const t = useTranslations('players.profile.connectionCard');

    // Newest session sits in the rightmost cell, so short histories pad on the left and
    // every server's strip stays aligned with the others.
    const recent = sessions.slice(-CELLS);
    const padding = CELLS - recent.length;

    const label = recent.length === 0
        ? t('noRecentSessions')
        : t('sessionStripAria', { count: recent.length });

    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                {t('recentSessions')}
            </span>
            <TooltipProvider>
                <div className="flex items-center gap-1" role="img" aria-label={label}>
                    {Array.from({ length: padding }, (_, i) => (
                        <div key={`empty-${i}`} className="size-4 rounded-[3px] bg-muted/50" />
                    ))}
                    {recent.map(session => {
                        const hours = secondsToHours(session.duration);
                        const date = dayjs(session.started_at).format('MMM D, YYYY HH:mm');
                        const cellLabel = t('sessionTooltip', { date, hours });
                        return (
                            <Tooltip key={session.started_at}>
                                <TooltipTrigger asChild>
                                    <div
                                        className="size-4 rounded-[3px] bg-pink-500 transition-opacity hover:ring-1 hover:ring-pink-500/60"
                                        style={{ opacity: 0.18 + 0.82 * Math.min(session.duration / scaleMax, 1) }}
                                        aria-label={cellLabel}
                                    />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{cellLabel}</p>
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </div>
            </TooltipProvider>
        </div>
    );
}
