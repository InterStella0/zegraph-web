'use client'
import {useEffect, useLayoutEffect, useState, useRef} from 'react';
import {useTranslations} from "next-intl";
import {Sheet, SheetContent} from "components/ui/sheet";
import {Button} from "components/ui/button";
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {ChevronLeft, ChevronRight, Users, Map, ChevronDown, ChevronUp, PlusCircle} from 'lucide-react';
import {useServerMap} from "./ServerProvider";
import {Community, Server} from "types/community";
import {usePathname, useRouter} from "next/navigation";
import {ScrollArea} from "components/ui/scroll-area.tsx";
import {HoverCard, HoverCardContent, HoverCardTrigger} from "components/ui/hover-card.tsx";
import {cn, setCookie} from "components/lib/utils";
import {withErrorCatch} from "components/common/withErrorCatch";
import {COMMUNITY_COLLAPSE} from "./communityCollapse";

const MAX_SERVERS_SHOWN = 3;

export function Logo() {
    return (
        <div className="logo flex items-center gap-2">
            <span
                className="text-[22px] font-bold bg-gradient-to-r from-pink-400 via-purple-500 to-purple-600 bg-clip-text text-transparent"
            >
                ZE Graph
            </span>
        </div>
    );
}

export const getServerAvatarText = (name: string) => {
    const words = name.split(' ');
    return words.length >= 2 ? words[0][0] + words[1][0] : name.substring(0, 2);
}

function CommunityAvatar({ community, className, textClassName }: { community: Community, className: string, textClassName: string }) {
    return (
        <Avatar className={className}>
            <AvatarImage src={community.icon_url} alt={community.name} />
            <AvatarFallback className={cn("bg-primary/10 text-primary font-semibold", textClassName)}>
                {getServerAvatarText(community.name).toUpperCase()}
            </AvatarFallback>
        </Avatar>
    );
}

function StatusDot({ status, className }: { status: boolean, className?: string }) {
    return <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background", status ? 'bg-green-500' : 'bg-gray-400', className)} />;
}

function CommunityHeader({ community }: { community: Community }) {
    const t = useTranslations('home');
    return (
        <div className="flex items-center gap-3 p-2 rounded-lg bg-accent/20 border border-border/30">
            <div className="relative flex-shrink-0">
                <CommunityAvatar community={community} className="w-10 h-10 ring-2 ring-background shadow-sm" textClassName="text-xs" />
                <StatusDot status={community.status} className="shadow-sm" />
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-foreground truncate mb-0.5">
                    {community.name}
                </h3>
                <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded">
                        <Users className="h-3 w-3" />
                        <span className="font-medium">{community.players}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {t('serverCount', {count: community.servers.length})}
                    </span>
                </div>
            </div>
        </div>
    );
}

function ServerList({ community, selected, onSelect, expanded, onToggleExpanded }: {
    community: Community, selected: Server | null, onSelect: (server: Server) => void, expanded: boolean, onToggleExpanded: () => void,
}) {
    const t = useTranslations('home');
    return (
        <div className="space-y-1.5 px-3">
            {(expanded ? community.servers : community.servers.slice(0, MAX_SERVERS_SHOWN)).map((communityServer) => {
                const isSelected = communityServer.gotoLink === selected?.gotoLink;
                const playerPercentage = communityServer.max_players > 0
                    ? (communityServer.players / communityServer.max_players) * 100
                    : 0;

                return (
                    <button
                        key={communityServer.id}
                        onClick={() => onSelect(communityServer)}
                        className={cn(
                            "w-full text-left px-3 py-2.5 rounded-md transition-all relative overflow-hidden",
                            isSelected ? 'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20' : 'hover:bg-accent/60 bg-accent/30'
                        )}
                    >
                        <div
                            className={cn("absolute bottom-0 left-0 h-0.5 transition-all", isSelected ? 'bg-primary-foreground/30' : 'bg-primary/30')}
                            style={{ width: `${playerPercentage}%` }}
                        />

                        <div className="flex items-start gap-2">
                            <div className={cn(
                                "w-2 h-2 rounded-full flex-shrink-0 mt-1",
                                communityServer.status ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-gray-400'
                            )} />

                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className={cn("text-sm truncate", isSelected ? 'font-semibold' : 'font-medium')}>
                                        {communityServer.name}
                                    </span>
                                    <div className={cn(
                                        "flex items-center gap-1 text-xs flex-shrink-0 font-semibold tabular-nums",
                                        isSelected ? 'text-primary-foreground/90' : 'text-foreground/80'
                                    )}>
                                        <Users className="h-3 w-3" />
                                        {communityServer.players}/{communityServer.max_players}
                                    </div>
                                </div>

                                <div className={cn("flex items-center gap-1 text-xs", isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                                    <Map className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">
                                        {communityServer.map}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </button>
                );
            })}

            {community.servers.length > MAX_SERVERS_SHOWN && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleExpanded}
                    className="w-full text-xs text-muted-foreground hover:text-foreground h-7"
                >
                    {expanded ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
                    {expanded ? t('showLess') : t('showMore', {count: community.servers.length - MAX_SERVERS_SHOWN})}
                </Button>
            )}
        </div>
    );
}

function CommunitySelector({ setDisplayCommunity, displayCommunity, setRequestOpen, initialCollapsed }: {
    displayCommunity: boolean,
    setDisplayCommunity: (value: boolean) => void,
    setRequestOpen: (value: boolean) => void,
    initialCollapsed: boolean | null
}) {
    const t = useTranslations('home');
    const [isClient, setIsClient] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const [isMobile, setIsMobile] = useState(false);
    const {communities, serversMapped } = useServerMap();

    const slugPart = pathname.split('/')[2]
    const server = slugPart ? serversMapped.get(decodeURIComponent(slugPart)) ?? null : null

    const [userPreference, setUserPreference] = useState<boolean | null>(initialCollapsed);
    const [autoCollapsed, setAutoCollapsed] = useState(false);
    const isCollapsed = !isMobile && (userPreference !== null ? userPreference : autoCollapsed);
    // Lives up here so a community stays expanded across hover-card reopenings and drawer collapses.
    const [expandedCommunities, setExpandedCommunities] = useState<Set<string>>(new Set());

    useLayoutEffect(() => {
        setIsClient(true);
        if (initialCollapsed === null) {
            const savedPreference = localStorage.getItem(COMMUNITY_COLLAPSE);
            if (savedPreference !== null) {
                setUserPreference(savedPreference === "true");
            }
        }
        const checkWidth = () => {
            const width = window.innerWidth;
            setIsMobile(width <= 750);
            setAutoCollapsed(width < 1510 && width > 750);
        };
        checkWidth();
        window.addEventListener('resize', checkWidth);
        return () => window.removeEventListener('resize', checkWidth);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!isClient) return;
        if (userPreference === null) {
            localStorage.removeItem(COMMUNITY_COLLAPSE);
        } else {
            localStorage.setItem(COMMUNITY_COLLAPSE, userPreference.toString());
        }
        setCookie(COMMUNITY_COLLAPSE, userPreference === null ? null : String(userPreference));
    }, [userPreference, isClient]);

    const prevAutoCollapsed = useRef(false);
    useEffect(() => {
        if (autoCollapsed && !prevAutoCollapsed.current) {
            setUserPreference(prev => prev === false ? null : prev);
        }
        prevAutoCollapsed.current = autoCollapsed;
    }, [autoCollapsed]);

    const handleSelectServer = (server: Server) => {
        router.push(`/servers/${server.gotoLink}`);
        if (isMobile) setDisplayCommunity(false);
    };

    const toggleCommunityExpanded = (communityId: string) => setExpandedCommunities(prev => {
        const next = new Set(prev);
        if (!next.delete(communityId)) next.add(communityId);
        return next;
    });
    const serverList = (community: Community) => (
        <ServerList
            community={community}
            selected={server}
            onSelect={handleSelectServer}
            expanded={expandedCommunities.has(community.id)}
            onToggleExpanded={() => toggleCommunityExpanded(community.id)}
        />
    );

    // Only the desktop drawer has a collapse toggle; matching the width-based default clears the preference.
    const handleToggleDrawer = () => setUserPreference(!isCollapsed === autoCollapsed ? null : !isCollapsed);

    const renderDrawerContent = (isCollapsed: boolean) => (
        <div className="h-full flex flex-col bg-background">
            <div className={cn(
                "flex items-center h-16 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0",
                isCollapsed ? 'justify-center px-4' : 'justify-between px-6'
            )}>
                {!isCollapsed && <Logo />}
                {!isMobile && <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleToggleDrawer}
                    className="h-9 w-9"
                >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {!isCollapsed && (
                    <div className="px-6 py-4 border-b border-border/40">
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            {t('title')}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {t('playersOnlineCount', {count: communities.reduce((a, b) => a + b.players, 0)})}
                        </p>
                    </div>
                )}

                <ScrollArea className="max-h-[calc(100vh-80px)]">
                <div className={isCollapsed ? "py-3" : "py-2"} style={{ width: isCollapsed ? 72 : 320 }}>
                    {communities.map((community) => (
                        <div key={community.id} className={isCollapsed ? "px-2 mb-2" : "mb-4 pb-4 border-b border-border/20 last:border-0"}>
                            {isCollapsed ? (
                                <HoverCard openDelay={100} closeDelay={100}>
                                    <div className="flex flex-col items-center gap-2">
                                        <HoverCardTrigger asChild>
                                            <button
                                                type="button"
                                                title={`${community.name} — ${t('playerCount', {count: community.players})}`}
                                                className="relative cursor-pointer outline-none focus:outline-none focus-visible:outline-none"
                                            >
                                                <CommunityAvatar
                                                    community={community}
                                                    className={cn("w-11 h-11 transition-all", server?.community_id === community.id
                                                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                                                        : 'opacity-70 hover:opacity-100')}
                                                    textClassName="text-sm"
                                                />
                                                {/* Sibling of the Avatar, like the status dot, so it keeps full
                                                    opacity while an unselected avatar dims to 70% */}
                                                {community.players > 0 && (
                                                    <span className=" absolute -top-1 -right-1 h-[18px] px-1 flex items-center justify-center gap-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-none tabular-nums border-2 border-background">
                                                        <Users className="h-2.5 w-2.5 flex-shrink-0" />
                                                        {community.players > 99 ? '99+' : community.players}
                                                    </span>
                                                )}
                                                <StatusDot status={community.status} />
                                            </button>
                                        </HoverCardTrigger>
                                    </div>
                                    <HoverCardContent
                                        side="right"
                                        align="start"
                                        sideOffset={12}
                                        className="w-80 p-0 overflow-hidden"
                                    >
                                        <div className="px-3 pt-3 pb-2">
                                            <CommunityHeader community={community} />
                                        </div>
                                        <div className="max-h-[60vh] overflow-y-auto pb-3">
                                            {serverList(community)}
                                        </div>
                                    </HoverCardContent>
                                </HoverCard>
                            ) : (
                                <>
                                    <div className="px-4 mb-3">
                                        <CommunityHeader community={community} />
                                    </div>
                                    {serverList(community)}
                                </>
                            )}
                        </div>
                    ))}
                </div>
                </ScrollArea>
            </div>

            <div className={cn("flex-shrink-0 border-t border-border/40 p-2", isCollapsed && 'flex justify-center')}>
                <Button
                    variant="ghost"
                    size={isCollapsed ? "icon" : "sm"}
                    onClick={() => setRequestOpen(true)}
                    title={t('requestServer')}
                    className={isCollapsed ? '' : 'w-full justify-start gap-2 text-muted-foreground'}
                >
                    <PlusCircle className="h-4 w-4 flex-shrink-0" />
                    {!isCollapsed && <span>{t('requestServer')}</span>}
                </Button>
            </div>
        </div>
    );

    if (isMobile) {
        return (
            <Sheet open={displayCommunity} onOpenChange={setDisplayCommunity}>
                <SheetContent side="left" className="w-[320px] p-0">
                    {renderDrawerContent(false)}
                </SheetContent>
            </Sheet>
        );
    }

    // Before hydration the width is unknown, so CSS picks the collapsed or full drawer at the breakpoint.
    const responsiveSSR = !isClient && userPreference !== true;
    return (
        <aside
            className={cn(
                "flex-shrink-0 h-screen overflow-hidden border-r border-border/40 sticky top-0 left-0",
                isClient ? 'transition-all duration-300 ease-in-out' : 'max-[751px]:hidden',
                responsiveSSR && 'w-[72px] min-[1510px]:w-[320px]'
            )}
            style={responsiveSSR ? undefined : { width: isCollapsed ? 72 : 320 }}
        >
            {responsiveSSR ? <>
                <div className="h-full min-[1510px]:hidden">{renderDrawerContent(true)}</div>
                <div className="h-full hidden min-[1510px]:block">{renderDrawerContent(false)}</div>
            </> : renderDrawerContent(isCollapsed)}
        </aside>
    );
}

export default withErrorCatch(CommunitySelector, () => "Community selector has an error :/");
