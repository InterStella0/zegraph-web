'use client';
import {useMemo} from 'react';
import Link from 'next/link';
import {toast} from 'sonner';
import {Avatar, AvatarFallback, AvatarImage} from 'components/ui/avatar';
import {Card, CardContent} from 'components/ui/card';
import {Button} from 'components/ui/button';
import {Badge} from 'components/ui/badge';
import {Progress} from 'components/ui/progress';
import {ArrowRight, BarChart3, Copy, Gamepad2} from 'lucide-react';
import {getServerAvatarText} from 'components/ui/CommunitySelector';
import {GAME_META} from 'components/ui/ServerIndicator';
import {Community, Server} from 'types/community';
import {useTranslations} from 'next-intl';

const NAME_MAX_CHARS = 20;

function truncate(text: string, max: number) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function ServerRow({server, rank}: {server: Server, rank: number}) {
    const t = useTranslations('home');
    const ratio = server.max_players > 0 ? (server.players / server.max_players) * 100 : 0;
    const gameMeta = server.game ? GAME_META[server.game] : undefined;
    const handleCopy = () => {
        navigator.clipboard.writeText(server.fullIp);
        toast.success(t('copiedToClipboard'));
    };
    return (
        <div className="flex flex-row items-center gap-3 py-2.5 border-t border-border/60 first:border-t-0">
            <span className="text-xs text-muted-foreground w-6 flex-shrink-0">#{rank}</span>
            <span
                className={`h-2 w-2 rounded-full flex-shrink-0 ${server.status ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <div className="min-w-0 flex-1">
                <div className="flex flex-row items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium truncate" title={server.name}>
                        {truncate(server.name, NAME_MAX_CHARS)}
                    </span>
                    {gameMeta && (
                        <Badge
                            variant="outline"
                            className={`h-5 px-1.5 gap-1 text-[10px] flex-shrink-0 ${gameMeta.className}`}
                        >
                            <Gamepad2 className="h-3 w-3" />
                            <span className="whitespace-nowrap">{gameMeta.label}</span>
                        </Badge>
                    )}
                </div>
                {server.map && (
                    <span className="text-xs font-mono text-muted-foreground truncate block">
                        {server.map}
                    </span>
                )}
            </div>
            <div className="hidden sm:flex flex-col items-end w-28 flex-shrink-0">
                <span className="text-xs whitespace-nowrap">
                    <span className="text-muted-foreground">{t('playersLabel')} </span>
                    {server.players} / {server.max_players}
                </span>
                <Progress value={ratio} className="h-1 mt-1 w-full" />
            </div>
            <button
                type="button"
                onClick={handleCopy}
                title={t('clickToCopy', {ip: server.fullIp})}
                className="group/copy hidden md:flex flex-row items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
                <span className="select-all">{server.fullIp}</span>
                <Copy className="h-3 w-3 opacity-60 group-hover/copy:opacity-100" />
            </button>
            <Button
                asChild
                size="sm"
                className="flex-shrink-0 gap-1.5 font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md group/view"
            >
                <Link href={`/servers/${server.gotoLink}`} aria-label={t('viewStatsFor', {name: server.name})}>
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('insight')}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/view:translate-x-0.5" />
                </Link>
            </Button>
        </div>
    );
}

export default function CommunityServerGroup({community}: {community: Community}) {
    const t = useTranslations('home');
    const servers = useMemo(
        () => [...community.servers].sort((a, b) => b.players - a.players),
        [community.servers],
    );

    return (
        <Card>
            <CardContent className="p-4 sm:p-5">
                <div className="flex flex-row items-center justify-between gap-3 mb-2">
                    <div className="flex flex-row items-center gap-3 min-w-0">
                        <Avatar className="w-9 h-9 font-bold flex-shrink-0">
                            <AvatarImage src={community.icon_url} alt={community.name} />
                            <AvatarFallback>{getServerAvatarText(community.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-semibold truncate">{community.name}</h3>
                            <p className="text-xs text-muted-foreground">
                                {t('serverCount', {count: community.servers.length})}
                            </p>
                        </div>
                    </div>
                    <span className="text-lg font-bold leading-none flex-shrink-0">
                        {community.players.toLocaleString()}
                    </span>
                </div>

                <div>
                    {servers.map((server, i) => (
                        <ServerRow key={server.id} server={server} rank={i + 1} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
