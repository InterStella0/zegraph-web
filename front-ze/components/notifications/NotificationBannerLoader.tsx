'use client';

import dynamic from "next/dynamic";
import { SteamProfile } from "../../next-auth-steam/steam";

const NotificationBanner = dynamic(
    () => import("./NotificationBanner").then(m => m.NotificationBanner),
    { ssr: false }
);

export function NotificationBannerLoader({ userPromise }: { userPromise: Promise<SteamProfile | null> }) {
    return <NotificationBanner userPromise={userPromise} />;
}
