'use client'
import { Users, LogOut, Clock, Star, Save, Hourglass, LucideIcon } from "lucide-react";
import { Card } from "../ui/card";
import { SkeletonText } from "../ui/skeleton";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useTranslations} from 'next-intl';
import {withErrorCatch} from "components/common/withErrorCatch";
import {InfoHint} from "components/maps/MapCardTitle";

const COLORS = {
    purple: 'text-purple-700 dark:text-purple-400',
    red: 'text-red-700 dark:text-red-400',
    blue: 'text-blue-700 dark:text-blue-400',
    green: 'text-green-700 dark:text-green-400',
};

type StatCardProps = {
    title: string, value: any, description: string, icon: LucideIcon, color: keyof typeof COLORS,
    loading: boolean, notReady?: boolean, href?: string | null,
}

function StatCard({ title, value, description, icon: Icon, color, loading, notReady = false, href = null }: StatCardProps) {
    const t = useTranslations('maps.analyze');
    const colorClass = COLORS[color];
    const hint = notReady ? t('stillCalculating') : description;
    const icon = <div className={colorClass}><Icon className="sm:h-5 sm:w-5 h-4 w-4" /></div>;

    return (
        <Card>
            <div className="sm:hidden w-full flex flex-row justify-between items-center">
                <div className="flex items-center gap-1.5">
                    {icon}
                    <div>
                        <div className="text-xs font-medium flex items-center">
                            {title}
                            <InfoHint text={hint} warn={notReady} className="ml-1" iconClassName="h-3 w-3" />
                        </div>

                        {loading ? (
                            <div className="text-xl font-bold leading-tight">
                                <SkeletonText className="w-[60px] h-[1em]" />
                            </div>
                        ) : (
                            <div className={`text-xl font-bold leading-tight ${colorClass}`}>
                                {value}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="hidden sm:flex w-full h-full flex-col">
                <div className="flex justify-between mb-2">
                    <div className="flex gap-2">
                        {icon}
                        <p className="text-sm font-medium">
                            {title}
                        </p>
                    </div>
                    <InfoHint text={hint} warn={notReady} />
                </div>

                {loading ? (
                    <div className="text-lg font-bold">
                        <SkeletonText className="w-4/5 h-5" />
                    </div>
                ) : href ? (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-lg font-bold mt-1 ${colorClass}`}
                    >
                        {value}
                    </a>
                ) : (
                    <p className={`text-lg font-bold mt-1 ${colorClass}`}>
                        {value}
                    </p>
                )}
            </div>
        </Card>
    );
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${['B', 'KB', 'MB', 'GB', 'TB', 'PB'][i]}`;
}

function MapStats() {
    const t = useTranslations('maps.analyze');
    const { analyze, info, notReady } = useMapContext();
    const statState = { loading: !analyze, notReady };
    const stats: (StatCardProps & { id: string })[] = [
        {
            id: "avg_players",
            title: t('avgPlayers'),
            value: analyze?.avg_players_per_session,
            description: t('avgPlayersDesc'),
            icon: Users,
            color: "purple",
            ...statState,
        },
        {
            id: "dropoff_rate",
            title: t('dropoffRate'),
            value: analyze ? `${(analyze.dropoff_rate * 100).toFixed(2)}%` : null,
            description: t('dropoffRateDesc'),
            icon: LogOut,
            color: "red",
            ...statState,
        },
        {
            id: "avg_playtime",
            title: t('avgPlaytime'),
            value: analyze ? `${(analyze.avg_playtime_before_quitting / 60).toFixed(0)}m` : null,
            description: t('avgPlaytimeDesc'),
            icon: Clock,
            color: "blue",
            ...statState,
        },
        {
            id: "cumulative hours",
            title: t('cumHours'),
            value: analyze? `${(analyze.cum_player_hours / 60 / 60).toFixed(1)}m`: 'N/A',
            description: t('cumHoursDesc'),
            icon: Hourglass,
            color: "green",
            ...statState,
        },
        {
            id: "creator",
            title: t('creators'),
            loading: !info,
            value: info?.creators || t('unknown'),
            description: t('creatorsDesc'),
            icon: Star,
            color: "purple",
            href: info?.workshop_id? `https://steamcommunity.com/sharedfiles/filedetails/?id=${info?.workshop_id}`: null
        },
        {
            id: "file_size",
            title: t('fileSize'),
            loading: !info,
            value: formatBytes(info?.file_bytes || 0),
            description: t('fileSizeDesc'),
            icon: Save,
            color: "blue",
        },
    ];

    return (
        <div className="w-full mx-0">
            <div className="grid md:grid-cols-3 xl:grid-cols-2 lg:grid-cols-1 gap-2 sm:grid-cols-2">
                {stats.map(({ id, ...stat }) => <StatCard key={id} {...stat} />)}
            </div>
        </div>
    );
}

export default withErrorCatch(MapStats, t => t('maps.analyze.loadError'))
