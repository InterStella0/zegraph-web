'use client';
import Link from 'next/link';
import {toast} from 'sonner';
import {Card, CardContent} from 'components/ui/card';
import {Button} from 'components/ui/button';
import {Progress} from 'components/ui/progress';
import {BarChart3, Copy} from 'lucide-react';
import {CommunityIcon} from 'components/ui/CommunityIcon';
import {GameLabel} from 'components/ui/ServerIndicator';
import {Community, Server} from 'types/community';
import {useTranslations} from 'next-intl';
import MapHoverCard from './MapHoverCard';

function ServerRow({server}: {server: Server}) {
    const t = useTranslations('home');
    const ratio = server.max_players > 0 ? (server.players / server.max_players) * 100 : 0;
    const handleCopy = () => {
        navigator.clipboard.writeText(server.fullIp);
        toast.success(t('copiedToClipboard'));
    };
    return (
        <div className="flex flex-row items-center gap-3 sm:gap-4 py-3 border-t border-border/60">
            <div className="min-w-0 flex-1">
                <Link
                    href={`/servers/${server.gotoLink}`}
                    className="text-sm font-medium truncate block w-fit max-w-full hover:text-primary hover:underline underline-offset-2"
                    title={server.name}
                >
                    {server.name}
                </Link>
                <div className="flex flex-row items-center gap-2 min-w-0 text-xs">
                    <GameLabel game={server.game} />
                    {server.map && (server.status
                        ? <MapHoverCard serverId={server.id} serverLink={server.gotoLink} map={server.map} />
                        : <span className="text-muted-foreground truncate">{server.map}</span>)}
                </div>
            </div>
            <div className="hidden sm:flex flex-col items-center w-28 flex-shrink-0">
                {server.status ? <>
                    <span className="text-xs whitespace-nowrap tabular-nums">
                        <span className="text-muted-foreground">{t('playersLabel')} </span>
                        <span className="font-semibold">{server.players} / {server.max_players}</span>
                    </span>
                    <Progress value={ratio} className="h-1 mt-1 w-full" />
                </> : (
                    <span className="text-sm font-medium text-red-500">{t('offline')}</span>
                )}
            </div>
            <span className={`sm:hidden text-xs flex-shrink-0 tabular-nums ${server.status ? 'text-muted-foreground' : 'text-red-500 font-medium'}`}>
                {server.status ? `${server.players} / ${server.max_players}` : t('offline')}
            </span>
            <button
                type="button"
                onClick={handleCopy}
                title={t('clickToCopy', {ip: server.fullIp})}
                className="group/copy hidden md:flex flex-row items-center justify-end gap-1.5 min-w-44 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
                <span className="select-all">{server.fullIp}</span>
                <Copy className="h-3 w-3 opacity-0 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100 transition-opacity" />
            </button>
            <Button
                asChild
                size="sm"
                className="flex-shrink-0 gap-1.5 font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
                <Link href={`/servers/${server.gotoLink}`} aria-label={t('viewStatsFor', {name: server.name})}>
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('insight')}</span>
                </Link>
            </Button>
        </div>
    );
}

export default function CommunityServerGroup({community}: {community: Community}) {
    const t = useTranslations('home');
    const servers = [...community.servers].sort((a, b) => b.players - a.players);

    return (
        <Card>
            <CardContent className="px-4 pt-4 pb-1 sm:px-5 sm:pt-5">
                <div className="flex flex-row items-center justify-between gap-3 pb-3">
                    <div className="flex flex-row items-center gap-3 min-w-0">
                        <CommunityIcon
                            name={community.name}
                            shortName={community.shorten_name}
                            iconUrl={community.icon_url}
                            className="flex-shrink-0"
                        />
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold truncate leading-tight">{community.name}</h3>
                            <p className="text-xs text-muted-foreground">
                                {t('serverCount', {count: community.servers.length})}
                            </p>
                        </div>
                    </div>
                    <span className="text-lg font-bold leading-none flex-shrink-0 tabular-nums">
                        {community.players.toLocaleString()}
                    </span>
                </div>

                <div className="pl-3 sm:pl-6">
                    {servers.map((server) => (
                        <ServerRow key={server.id} server={server} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
