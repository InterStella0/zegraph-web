'use client'
import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import Announcement from "components/ui/Annoucement";
import Footer from "components/ui/Footer";
import {ReactNode, Suspense, use} from "react";
import {SteamProfile} from "../../../next-auth-steam/steam.ts";
import type {Announcement as AnnouncementData} from "types/announcements";
import {ServerSlugPromise} from "./util.ts";
import {useSidebar} from "../ServersShell";

export default function ResponsiveAppSelector(
    { children, serverPromise, user, announcementsPromise }: {children: ReactNode, serverPromise: ServerSlugPromise, user: Promise<SteamProfile | null>, announcementsPromise: Promise<AnnouncementData[]> }
) {
    const server = use(serverPromise)
    const { setDisplayCommunity } = useSidebar()
    return (
        <div className="grow overflow-auto">
            <div className="min-h-screen">
                <ResponsiveAppBar server={server} userPromise={user} setDisplayCommunity={setDisplayCommunity} />
                <Suspense fallback={null}>
                    <Announcement announcementsPromise={announcementsPromise} />
                </Suspense>
                {children}
            </div>
        <Footer />
        </div>
    )
}
