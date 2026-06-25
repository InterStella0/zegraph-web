'use client'
import {
    Sheet,
    SheetContent,
    SheetHeader,
} from "components/ui/sheet";
import {Button} from "components/ui/button";
import {useState} from "react";
import {Menu, X, Coffee} from "lucide-react";
import {Logo} from "./CommunitySelector";
import LoginButton from "./LoginButton";
import {pagesSelection} from "./PagesNavigation";
import {Server} from "types/community";
import {useRouter, usePathname} from "next/navigation";
import {SiDiscord, SiGithub} from "@icons-pack/react-simple-icons";
import {SteamProfile} from "../../next-auth-steam/steam.ts";

export default function NavDrawerButton({ server, user }: { server: Server | null, user: SteamProfile | null }) {
    const currentLocation = usePathname();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const router = useRouter();
    const selectedMode = server !== null? 'ServerSpecific': 'Community'
    const pages = pagesSelection[selectedMode]

    const handleDrawerToggle = () => {
        setDrawerOpen(!drawerOpen);
    };

    const handleNavigate = (link) => {
        setDrawerOpen(false);
        router.push(link);
    };
    return <>
        <Button
            variant="ghost"
            size="icon"
            onClick={handleDrawerToggle}
            className="min-[750px]:hidden"
        >
            <Menu className="h-5 w-5" />
        </Button>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent side="left" className="w-64 p-0">
                <div className="flex flex-col h-full">
                    <SheetHeader className="p-4 border-b border-border">
                        <div className="flex items-center justify-between">
                            <Logo />
                        </div>
                    </SheetHeader>

                    <nav className="flex-1 overflow-auto">
                        <ul className="space-y-1 p-2">
                            {Object.entries(pages).map(([pageName, pageLink]) => {
                                const linked = selectedMode === 'ServerSpecific'? pageLink.replace(":server_id", server.gotoLink): pageLink
                                const isActive = currentLocation === linked
                                return (
                                    <li key={pageName}>
                                        <Button
                                            variant="ghost"
                                            onClick={() => handleNavigate(linked)}
                                            className={`w-full justify-start ${
                                                isActive
                                                    ? 'bg-primary/10 border-l-4 border-primary font-semibold text-primary'
                                                    : 'border-l-4 border-transparent'
                                            }`}
                                        >
                                            {pageName}
                                        </Button>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>

                    <div className="flex items-center justify-between gap-2 p-4 border-t border-border mt-auto">
                        <LoginButton user={user} />
                        <Button
                            variant="ghost"
                            size="icon"
                            asChild
                        >
                            <a href="https://goes.queeniemella.cc/s/discord-zegraph" target="_blank" rel="noopener noreferrer">
                                <SiDiscord className="h-4 w-4 text-primary" />
                            </a>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            asChild
                        >
                            <a href="https://github.com/InterStella0/zegraph-web" target="_blank" rel="noopener noreferrer">
                                <SiGithub className="h-4 w-4 text-primary" />
                            </a>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { handleNavigate('/donors'); }}
                            title="Support ZE Graph"
                        >
                            <Coffee className="h-4 w-4 text-primary" />
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    </>
}