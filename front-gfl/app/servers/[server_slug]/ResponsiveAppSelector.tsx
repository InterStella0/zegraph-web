'use client'
import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import Announcement from "components/ui/Annoucement";
import Footer from "components/ui/Footer";
import {ReactNode, use} from "react";
import {SteamProfile} from "../../../next-auth-steam/steam.ts";
import {ServerSlugPromise} from "./util.ts";
import {useSidebar} from "../ServersShell";

export default function ResponsiveAppSelector(
    { children, serverPromise, user }: {children: ReactNode, serverPromise: ServerSlugPromise, user: Promise<SteamProfile | null> }
) {
    const server = use(serverPromise)
    const { setDisplayCommunity } = useSidebar()
    return (
        <div className="grow overflow-auto">
            <div className="min-h-[calc(100vh-80px)]">
                <ResponsiveAppBar server={server} userPromise={user} setDisplayCommunity={setDisplayCommunity} />
                <Announcement />
                {children}
            </div>
        <Footer />
        </div>
    )
}
