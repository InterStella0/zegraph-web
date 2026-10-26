'use client'
import {Sheet, SheetContent, SheetHeader} from "components/ui/sheet";
import {Button} from "components/ui/button";
import {useState} from "react";
import {Menu, Coffee} from "lucide-react";
import {Logo} from "./CommunitySelector";
import LoginButton from "./LoginButton";
import {isPageGroup, PageLink, pageLinks} from "./PagesNavigation";
import {Server} from "types/community";
import {useRouter, usePathname} from "next/navigation";
import {SiDiscord, SiGithub} from "@icons-pack/react-simple-icons";
import {SteamProfile} from "types/steam";
import {useTranslations} from "next-intl";
import LanguageToggle from "./LanguageToggle";
import {DISCORD_URL, REPO_URL} from "./siteLinks";

export default function NavDrawerButton({ server, user }: { server: Server | null, user: SteamProfile | null }) {
    const t = useTranslations('nav');
    const currentLocation = usePathname();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const router = useRouter();
    const { pages, resolve } = pageLinks(server)

    const handleNavigate = (link: string) => {
        setDrawerOpen(false);
        router.push(link);
    };

    const renderLink = (page: PageLink) => {
        const linked = resolve(page.href)
        return (
            <Button
                variant="ghost"
                onClick={() => handleNavigate(linked)}
                className={`w-full justify-start border-l-4 ${
                    currentLocation === linked ? 'bg-primary/10 border-primary font-semibold text-primary' : 'border-transparent'
                }`}
            >
                {t(page.key)}
            </Button>
        );
    };
    return <>
        <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(!drawerOpen)}
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
                            {pages.map((page) => {
                                if (isPageGroup(page)) {
                                    return (
                                        <li key={page.key}>
                                            <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                {t(page.key)}
                                            </p>
                                            <ul className="space-y-1">
                                                {page.children.map((child) => (
                                                    <li key={child.key}>{renderLink(child)}</li>
                                                ))}
                                            </ul>
                                        </li>
                                    );
                                }
                                return <li key={page.key}>{renderLink(page)}</li>;
                            })}
                        </ul>
                    </nav>

                    <div className="px-4 pt-4 border-t border-border mt-auto">
                        <Button variant="outline" className="w-full h-auto justify-start gap-3 py-2 whitespace-normal text-left" asChild>
                            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
                                <SiDiscord className="h-5 w-5 shrink-0 text-[#5865F2]" />
                                <span className="text-sm">{t('discordCta')}</span>
                            </a>
                        </Button>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-4">
                        <LoginButton user={user} />
                        <LanguageToggle />
                        <Button variant="ghost" size="icon" asChild>
                            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                                <SiGithub className="h-4 w-4 text-primary" />
                            </a>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleNavigate('/donors')}
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