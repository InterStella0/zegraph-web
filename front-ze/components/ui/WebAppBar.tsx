'use client'
import LoginButton from "./LoginButton";
import {Server} from "types/community";
import NavDrawerButton from "./NavDrawerButton";
import PagesNavigation from "./PagesNavigation";
import ServerIndicator from "./ServerIndicator";
import {use} from "react";
import {SteamProfile} from "../../next-auth-steam/steam.ts";
import LanguageToggle from "./LanguageToggle";


export default function WebAppBar(
    { userPromise, server, setDisplayCommunity }
    : { server: Server | null, userPromise: Promise<SteamProfile> | null, setDisplayCommunity: Dispatch<boolean> }
) {
    const user = use(userPromise)
    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <nav className="container mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-4">
                    <div className="min-[750px]:hidden">
                        <NavDrawerButton server={server} user={user} />
                    </div>
                    <div className="hidden min-[877px]:block min-[1200px]:hidden">
                        <ServerIndicator server={server} setDisplayCommunity={setDisplayCommunity} />
                    </div>
                    <div className="hidden min-[1200px]:block">
                        <ServerIndicator server={server} setDisplayCommunity={null} />
                    </div>
                </div>

                <div className="hidden min-[750px]:flex flex-1 items-center justify-center px-6">
                    <div className="flex gap-6">
                        <PagesNavigation server={server}/>
                    </div>
                </div>

                <div className="flex min-[750px]:hidden flex-1 items-center justify-center px-4">
                    <ServerIndicator server={server} setDisplayCommunity={setDisplayCommunity} />
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden min-[750px]:flex items-center gap-2">
                        <LanguageToggle />
                        <LoginButton user={user} />
                    </div>
                    <div className="min-[750px]:hidden w-10"></div>
                </div>
            </nav>
        </header>
    )
}