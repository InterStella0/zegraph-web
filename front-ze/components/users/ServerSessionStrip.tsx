'use client';

import { ProfileRecentSession } from "types/community";
import { useTranslations } from "next-intl";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import { range, secondsToHours } from "utils/generalUtils";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/ui/tooltip";

const CELLS = 7;

interface ServerSessionStripProps {
    sessions: ProfileRecentSession[];
    scaleMax: number;
    color?: string;
}

export default function ServerSessionStrip({ sessions, scaleMax, color = "rgb(236, 72, 153)" }: ServerSessionStripProps) {
    const t = useTranslations('players.profile.connectionCard');
    const toDayjs = useLocalDayjs();

    const recent = sessions.slice(-CELLS);
    const label = recent.length === 0 ? t('noRecentSessions') : t('sessionStripAria', { count: recent.length });

    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                {t('recentSessions')}
            </span>
            <div className="flex items-center gap-1" role="img" aria-label={label}>
                {range(CELLS - recent.length).map(i => (
                    <div key={`empty-${i}`} className="size-4 rounded-[3px] bg-muted/50" />
                ))}
                {recent.map(session => {
                    const hours = secondsToHours(session.duration);
                    const date = toDayjs(session.started_at).format('MMM D, YYYY HH:mm');
                    const cellLabel = t('sessionTooltip', { date, hours });
                    return (
                        <Tooltip key={session.started_at}>
                            <TooltipTrigger asChild>
                                <div
                                    className="size-4 rounded-[3px] transition-opacity hover:ring-1 hover:ring-foreground/40"
                                    style={{ backgroundColor: color, opacity: 0.18 + 0.82 * Math.min(session.duration / scaleMax, 1) }}
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
        </div>
    );
}
