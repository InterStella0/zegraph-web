'use client'
import Link from "next/link";
import {Server} from "types/community";
import {useEffect, useMemo, useState} from "react";
import {usePathname} from "next/navigation";
import {useTranslations} from "next-intl";


export const pagesSelection = {
    'ServerSpecific': [
        {key: 'communities', href: '/'},
        {key: 'server', href: '/servers/:server_id'},
        {key: 'players', href: '/servers/:server_id/players'},
        {key: 'maps', href: '/servers/:server_id/maps'},
        {key: 'models', href: '/servers/:server_id/models'},
        {key: 'guides', href: '/servers/:server_id/guides'},
        {key: 'radar', href: '/servers/:server_id/radar'},
    ],
    'Community': [
        {key: 'communities', href: '/'},
        {key: 'tracker', href: '/live'},
        {key: 'hub', href: '/hub'},
        {key: 'status', href: '/status'},
        {key: 'donors', href: '/donors'},
    ]
} as const


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
        return pages.map((page, i) => {
            const linked = selectedMode === 'ServerSpecific'
                ? page.href.replace(":server_id", server?.gotoLink)
                : page.href;

            const activePath = pendingLocation ?? currentLocation;
            const isActive = activePath === linked;

            return (
                <Link
                    key={i}
                    prefetch
                    className={`relative py-2 text-sm font-medium transition-colors duration-200 hover:text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:bg-primary after:transition-all after:duration-200 after:rounded-sm ${
                        isActive
                            ? 'text-primary font-semibold after:w-full'
                            : 'text-muted-foreground after:w-0 hover:after:w-full'
                    }`}
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
