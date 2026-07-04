'use client'
import Link from "next/link";
import {Server} from "types/community";
import {useEffect, useMemo, useState} from "react";
import {usePathname} from "next/navigation";


export const pagesSelection = {
    'ServerSpecific': {
        'Communities': '/',
        'Server': '/servers/:server_id',
        'Players': '/servers/:server_id/players',
        'Maps': '/servers/:server_id/maps',
        'Models': '/servers/:server_id/models',
        'Guides': '/servers/:server_id/guides',
        'Radar': '/servers/:server_id/radar',
    },
    'Community': {
        'Communities': '/',
        'Tracker': '/live',
        'Hub': '/hub',
        'Status': '/status',
        'Donors': '/donors',
    }
}


export default function PagesNavigation({ server }: { server: Server }) {
    const currentLocation = usePathname();
    const [pendingLocation, setPendingLocation] = useState<string | null>(null);

    useEffect(() => {
        setPendingLocation(null);
    }, [currentLocation]);

    const selectedMode = server !== null ? 'ServerSpecific' : 'Community';
    const pages = pagesSelection[selectedMode];

    const pagesNav = useMemo(() => {
        return Object.entries(pages).map(([pageName, page], i) => {
            const linked = selectedMode === 'ServerSpecific'
                ? page.replace(":server_id", server?.gotoLink)
                : page;

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
                    {pageName}
                </Link>
            );
        });
    }, [currentLocation, pendingLocation, server, selectedMode, pages]);

    return <>{pagesNav}</>;
}
