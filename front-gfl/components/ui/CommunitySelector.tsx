'use client'
import {useContext, useEffect, useLayoutEffect, useState, useCallback, useRef} from 'react';
import {useTranslations} from "next-intl";
import {Sheet, SheetContent} from "components/ui/sheet";
import {Button} from "components/ui/button";
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {ChevronLeft, ChevronRight, X, Users, Map, ChevronDown, ChevronUp, PlusCircle} from 'lucide-react';
import ErrorCatch from "./ErrorMessage.tsx";
import ServerProvider from "./ServerProvider";
import {Server} from "types/community";
import {usePathname, useRouter} from "next/navigation";
import {ScrollArea} from "components/ui/scroll-area.tsx";
import {HoverCard, HoverCardContent, HoverCardTrigger} from "components/ui/hover-card.tsx";
import {COMMUNITY_COLLAPSE} from "./communityCollapse";

export function Logo() {
    return (
        <div className="logo flex items-center gap-2">
            <h1
                className="text-[22px] font-bold bg-gradient-to-r from-pink-400 via-purple-500 to-purple-600 bg-clip-text text-transparent"
            >
                ZE Graph
            </h1>
        </div>
    );
}

export const getServerAvatarText = (name: string) => {
    const words = name.split(' ');
    return words.length >= 2 ? words[0][0] + words[1][0] : name.substring(0, 2);
}

const getStatusColor = (status: boolean) => {
    return status ? 'bg-green-500' : 'bg-gray-400';
};

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
    const {communities, serversMapped } = useContext(ServerProvider);

    // The sidebar lives above the [server_slug] segment so it survives server
    // navigation; the selected server comes from the URL instead of props.
    const slugPart = pathname.split('/')[2]
    const server = slugPart ? serversMapped.get(decodeURIComponent(slugPart)) ?? null : null
    const communitySelected = server?.community_id
    const openDrawer = displayCommunity
    const onClose = () => setDisplayCommunity(false)

    // Seeded from the cookie server-side so the first frame is already correct;
    // null = follow auto
    const [userPreference, setUserPreference] = useState<boolean | null>(initialCollapsed);
    const [autoCollapsed, setAutoCollapsed] = useState(false);
    // Mobile sheet always shows the full layout; the saved preference still
    // applies once back on desktop widths
    const isCollapsed = !isMobile && (userPreference !== null ? userPreference : autoCollapsed);

    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [expandedCommunities, setExpandedCommunities] = useState<Set<string>>(new Set());

    const checkWidth = useCallback(() => {
        const width = window.innerWidth;
        setIsMobile(width <= 750);
        setAutoCollapsed(width < 1510 && width > 750);
    }, []);

    // Layout effect so the real width (and any legacy localStorage-only
    // preference, when no cookie was set yet) applies before first paint
    useLayoutEffect(() => {
        setIsClient(true);
        if (initialCollapsed === null) {
            const savedPreference = localStorage.getItem(COMMUNITY_COLLAPSE);
            if (savedPreference !== null) {
                setUserPreference(savedPreference === "true");
            }
        }
        checkWidth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checkWidth]);

    useEffect(() => {
        if (!isClient) return;
        if (userPreference === null) {
            localStorage.removeItem(COMMUNITY_COLLAPSE);
            document.cookie = `${COMMUNITY_COLLAPSE}=; path=/; max-age=0; SameSite=Lax`;
        } else {
            localStorage.setItem(COMMUNITY_COLLAPSE, userPreference.toString());
            document.cookie = `${COMMUNITY_COLLAPSE}=${userPreference}; path=/; max-age=31536000; SameSite=Lax`;
        }
    }, [userPreference, isClient]);

    useEffect(() => {
        window.addEventListener('resize', checkWidth);
        return () => window.removeEventListener('resize', checkWidth);
    }, [checkWidth]);

    // Entering the auto-collapse zone (including loading in it) overrides an
    // explicit "expanded" preference; a "collapsed" preference always sticks
    const prevAutoCollapsed = useRef(false);
    useEffect(() => {
        if (autoCollapsed && !prevAutoCollapsed.current) {
            setUserPreference(prev => prev === false ? null : prev);
        }
        prevAutoCollapsed.current = autoCollapsed;
    }, [autoCollapsed]);

    useEffect(() => {
        setIsMobileOpen(openDrawer);
    }, [openDrawer]);

    const drawerWidth = isCollapsed ? 72 : 320;

    const handleSelectServer = useCallback((server: Server) => {
        router.push(`/servers/${server.gotoLink}`);
        if (isMobile) {
            setIsMobileOpen(false);
            onClose?.();
        }
    }, [router, isMobile, onClose]);

    const handleToggleDrawer = useCallback(() => {
        if (isMobile) {
            setIsMobileOpen(prev => !prev);
            onClose?.();
        } else {
            const newCollapsedState = !isCollapsed;

            // If toggling to match auto state, clear preference to follow auto
            // Otherwise, set explicit preference
            if (newCollapsedState === autoCollapsed) {
                setUserPreference(null);
            } else {
                setUserPreference(newCollapsedState);
            }
        }
    }, [isMobile, onClose, isCollapsed, autoCollapsed]);

    const toggleCommunityExpanded = useCallback((communityId: string) => {
        setExpandedCommunities(prev => {
            const newSet = new Set(prev);
            if (newSet.has(communityId)) {
                newSet.delete(communityId);
            } else {
                newSet.add(communityId);
            }
            return newSet;
        });
    }, []);

    const MAX_SERVERS_SHOWN = 3;

    const renderCommunityHeader = (community: (typeof communities)[number]) => (
        <div className="flex items-center gap-3 p-2 rounded-lg bg-accent/20 border border-border/30">
            <div className="relative flex-shrink-0">
                <Avatar className="w-10 h-10 ring-2 ring-background shadow-sm">
                    <AvatarImage src={community.icon_url} alt={community.name} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                        {getServerAvatarText(community.name).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background shadow-sm ${getStatusColor(community.status)}`} />
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

    const renderServerList = (community: (typeof communities)[number]) => (
        <div className="space-y-1.5 px-3">
            {(expandedCommunities.has(community.id)
                ? community.servers
                : community.servers.slice(0, MAX_SERVERS_SHOWN)
            ).map((communityServer) => {
                const isSelected = communityServer.gotoLink === server?.gotoLink;
                const playerPercentage = communityServer.max_players > 0
                    ? (communityServer.players / communityServer.max_players) * 100
                    : 0;

                return (
                    <button
                        key={communityServer.id}
                        onClick={() => handleSelectServer(communityServer)}
                        className={`w-full text-left px-3 py-2.5 rounded-md transition-all relative overflow-hidden ${
                            isSelected
                                ? 'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20'
                                : 'hover:bg-accent/60 bg-accent/30'
                        }`}
                    >
                        <div
                            className={`absolute bottom-0 left-0 h-0.5 transition-all ${
                                isSelected ? 'bg-primary-foreground/30' : 'bg-primary/30'
                            }`}
                            style={{ width: `${playerPercentage}%` }}
                        />

                        <div className="flex items-start gap-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${
                                communityServer.status ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-gray-400'
                            }`} />

                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className={`text-sm truncate ${
                                        isSelected ? 'font-semibold' : 'font-medium'
                                    }`}>
                                        {communityServer.name}
                                    </span>
                                    <div className={`flex items-center gap-1 text-xs flex-shrink-0 font-semibold tabular-nums ${
                                        isSelected ? 'text-primary-foreground/90' : 'text-foreground/80'
                                    }`}>
                                        <Users className="h-3 w-3" />
                                        {communityServer.players}/{communityServer.max_players}
                                    </div>
                                </div>

                                <div className={`flex items-center gap-1 text-xs ${
                                    isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                }`}>
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
                    onClick={() => toggleCommunityExpanded(community.id)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground h-7"
                >
                    {expandedCommunities.has(community.id) ? (
                        <>
                            <ChevronUp className="mr-1 h-3 w-3" />
                            {t('showLess')}
                        </>
                    ) : (
                        <>
                            <ChevronDown className="mr-1 h-3 w-3" />
                            {t('showMore', {count: community.servers.length - MAX_SERVERS_SHOWN})}
                        </>
                    )}
                </Button>
            )}
        </div>
    );

    const drawerContent = (
        <div className="h-full flex flex-col bg-background">
            <div className={`flex items-center ${
                isCollapsed ? 'justify-center px-4' : 'justify-between px-6'
            } h-16 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0`}>
                {!(!isMobile && isCollapsed) && <Logo />}
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
                <div className={`${isCollapsed ? "py-3" : "py-2"}`}  style={{ width: drawerWidth }}>
                    {communities.map((community) => {
                        const isCommunitySelected = communitySelected === community.id;

                        return (
                            <div key={community.id} className={isCollapsed ? "px-2 mb-2" : "mb-4 pb-4 border-b border-border/20 last:border-0"}>
                                {(!isMobile && isCollapsed) ? (
                                    <HoverCard openDelay={100} closeDelay={100}>
                                        <div className="flex flex-col items-center gap-2">
                                            <HoverCardTrigger asChild>
                                                <button
                                                    type="button"
                                                    title={community.name}
                                                    className="relative cursor-pointer outline-none focus:outline-none focus-visible:outline-none"
                                                >
                                                    <Avatar className={`w-11 h-11 transition-all ${
                                                        isCommunitySelected
                                                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                                                            : 'opacity-70 hover:opacity-100'
                                                    }`}>
                                                        <AvatarImage src={community.icon_url} alt={community.name} />
                                                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                                                            {getServerAvatarText(community.name).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(community.status)}`} />
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
                                                {renderCommunityHeader(community)}
                                            </div>
                                            <div className="max-h-[60vh] overflow-y-auto pb-3">
                                                {renderServerList(community)}
                                            </div>
                                        </HoverCardContent>
                                    </HoverCard>
                                ) : (
                                    <>
                                        <div className="px-4 mb-3">
                                            {renderCommunityHeader(community)}
                                        </div>

                                        {renderServerList(community)}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
                </ScrollArea>
            </div>

            <div className={`flex-shrink-0 border-t border-border/40 p-2 ${isCollapsed ? 'flex justify-center' : ''}`}>
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
            <Sheet open={isMobileOpen} onOpenChange={(data) => {
                setIsMobileOpen(data);
                setDisplayCommunity(data)
            }}>
                <SheetContent side="left" className="w-[320px] p-0">
                    {drawerContent}
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <aside
            className={`flex-shrink-0 h-screen overflow-hidden border-r border-border/40 ${
                isClient ? 'transition-all duration-300 ease-in-out' : 'max-[1199px]:hidden'
            } sticky top-0 left-0`}
            style={{ width: drawerWidth }}
        >
            {drawerContent}
        </aside>
    );
}

function CommunitySelectorDisplay({ displayCommunity, setDisplayCommunity, setRequestOpen, initialCollapsed }
                                  : { displayCommunity: boolean, setDisplayCommunity: (value: boolean) => void, setRequestOpen: (value: boolean) => void, initialCollapsed: boolean | null }) {
    return (
        <ErrorCatch message="Community selector has an error :/">
            <CommunitySelector displayCommunity={displayCommunity} setDisplayCommunity={setDisplayCommunity} setRequestOpen={setRequestOpen} initialCollapsed={initialCollapsed} />
        </ErrorCatch>
    );
}

export default CommunitySelectorDisplay;
