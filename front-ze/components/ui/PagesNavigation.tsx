'use client'
import Link from "next/link";
import {Server} from "types/community";
import {useEffect, useMemo, useState} from "react";
import {usePathname} from "next/navigation";
import {useTranslations} from "next-intl";
import {ChevronDown} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./dropdown-menu";

export type PageLink = { key: string, href: string }
export type PageGroup = { key: string, children: readonly PageLink[] }
export type PageEntry = PageLink | PageGroup

export const isPageGroup = (entry: PageEntry): entry is PageGroup => 'children' in entry

export const pagesSelection: Record<'ServerSpecific' | 'Community', readonly PageEntry[]> = {
    'ServerSpecific': [
        {key: 'communities', href: '/'},
        {key: 'server', href: '/servers/:server_id'},
        {key: 'players', href: '/servers/:server_id/players'},
        {key: 'maps', href: '/servers/:server_id/maps'},
        {key: 'models', href: '/servers/:server_id/models'},
        {key: 'radar', href: '/servers/:server_id/radar'},
    ],
    'Community': [
        {key: 'communities', href: '/'},
        {key: 'players', href: '/players'},
        {key: 'discover', children: [
            {key: 'hub', href: '/hub'},
            {key: 'tracker', href: '/live'},
            {key: 'status', href: '/status'},
            {key: 'donors', href: '/donors'},
        ]},
        {key: 'developer', children: [
            {key: 'apiDocs', href: '/data/api/ui'},
            {key: 'mcp', href: '/mcp-setup'},
        ]},
    ]
} as const

const underline = 'relative py-2 text-sm font-medium transition-colors duration-200 hover:text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:bg-primary after:transition-all after:duration-200 after:rounded-sm'
const activeUnderline = 'text-primary font-semibold after:w-full'
const inactiveUnderline = 'text-muted-foreground after:w-0 hover:after:w-full'

export default function PagesNavigation({ server }: { server: Server }) {
    const t = useTranslations('nav');
    const currentLocation = usePathname();
    const [pendingLocation, setPendingLocation] = useState<string | null>(null);

    useEffect(() => {
        setPendingLocation(null);
    }, [currentLocation]);

    const selectedMode = server !== null ? 'ServerSpecific' : 'Community';
    const pages = pagesSelection[selectedMode];

    const pagesNav = useMemo(() => {
        const activePath = pendingLocation ?? currentLocation;
        const resolve = (href: string) => selectedMode === 'ServerSpecific'
            ? href.replace(":server_id", server?.gotoLink)
            : href;

        return pages.map((page) => {
            if (isPageGroup(page)) {
                const groupActive = page.children.some(child => resolve(child.href) === activePath);
                return (
                    <DropdownMenu key={page.key} modal={false}>
                        <DropdownMenuTrigger
                            className={`${underline} group flex items-center gap-1 outline-none cursor-pointer data-[state=open]:text-primary data-[state=open]:after:w-full ${
                                groupActive ? activeUnderline : inactiveUnderline
                            }`}
                        >
                            {t(page.key)}
                            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="min-w-40">
                            {page.children.map((child) => {
                                const linked = resolve(child.href);
                                const isActive = activePath === linked;
                                return (
                                    <DropdownMenuItem key={child.key} asChild className={`cursor-pointer ${isActive ? 'text-primary font-semibold' : ''}`}>
                                        <Link prefetch href={linked} onClick={() => setPendingLocation(linked)}>
                                            {t(child.key)}
                                        </Link>
                                    </DropdownMenuItem>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            }

            const linked = resolve(page.href);
            const isActive = activePath === linked;

            return (
                <Link
                    key={page.key}
                    prefetch
                    className={`${underline} ${isActive ? activeUnderline : inactiveUnderline}`}
                    href={linked}
                    onClick={() => setPendingLocation(linked)}
                >
                    {t(page.key)}
                </Link>
            );
        });
    }, [currentLocation, pendingLocation, server, selectedMode, pages, t]);

    return <>{pagesNav}</>;
}
