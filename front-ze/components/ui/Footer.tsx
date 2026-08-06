import { Star, Coffee, Mail } from "lucide-react";
import Link from "next/link";
import BuildInfo from "./BuildInfo";
import FooterFab from "./FooterFab";
import ThemeToggle from "./ThemeToggle";
import LanguageToggle from "./LanguageToggle";
import IconLink from "./IconLink";
import {SiDiscord, SiGithub, SiSteam} from "@icons-pack/react-simple-icons";
import {Button} from "components/ui/button.tsx";
import {useTranslations} from "next-intl";

export default function Footer() {
    const t = useTranslations('footer');
    const currentYear = new Date().getFullYear();

    return (
        <>
            <FooterFab />

            <footer className="relative mt-auto w-full overflow-hidden border-t-1 py-6">
                {/* Decorative background blobs */}
                <div className="absolute -top-4 left-[10%] h-10 w-10 rounded-full" />
                <div className="absolute -bottom-5 right-[15%] h-16 w-16 rounded-full" />
                <div className="absolute left-[80%] top-[40%] h-6 w-6 rounded-full" />

                <div className="container mx-auto max-w-6xl px-4">
                    <div className="mb-4 flex flex-col items-center justify-between gap-6 md:mb-3 md:flex-row">
                        <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 fill-primary text-primary" />
                            <p className="text-sm text-muted-foreground">
                                {t('copyright', {year: currentYear})}
                            </p>
                        </div>

                        <div className="flex items-center gap-1">
                            <ThemeToggle />
                            <LanguageToggle />

                            <div className="flex items-center">
                                <IconLink
                                    href="https://goes.queeniemella.cc/s/discord-zegraph"
                                    ariaLabel="Discord"
                                    tooltip={t('supportServer')}
                                    icon={<SiDiscord className="h-5 w-5 text-primary" />}
                                />
                                <span className="ml-1 hidden text-xs text-foreground md:block">
                                    {t('supportServer')}
                                </span>
                            </div>

                            <div className="flex items-center">
                                <IconLink
                                    href="https://steamcommunity.com/id/Stella667/"
                                    ariaLabel="Steam"
                                    tooltip="Steam: queeniemella"
                                    icon={<SiSteam className="h-5 w-5 text-primary" />}
                                />
                                <span className="ml-1 hidden text-xs text-foreground md:block">
                                    queeniemella
                                </span>
                            </div>

                            <div className="flex items-center">
                                <IconLink
                                    href="https://github.com/InterStella0/zegraph-web"
                                    ariaLabel="GitHub"
                                    tooltip="GitHub: InterStella0"
                                    icon={<SiGithub className="h-5 w-5 text-primary" />}
                                />
                                <span className="ml-1 hidden text-xs text-foreground md:block">
                                    InterStella0
                                </span>
                            </div>

                            <div className="flex items-center">
                                <IconLink
                                    href="/donors"
                                    ariaLabel="Donate"
                                    tooltip={t('supportZeGraph')}
                                    icon={<Coffee className="h-5 w-5 text-primary" />}
                                />
                                <span className="ml-1 hidden text-xs text-foreground md:block">
                                    {t('donate')}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="relative mt-8 flex w-full flex-col items-center">
                        <div className="relative flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
                            <div className="flex justify-center sm:justify-start">
                                <div className="w-fit rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-secondary/10 px-6 py-2.5 shadow-sm backdrop-blur-sm transition-all hover:shadow-md">
                                    <p className="text-sm font-medium tracking-wide text-foreground">
                                        {t('beNice')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-center sm:justify-end max-sm:flex-col gap-4">
                                <BuildInfo />
                                <Button
                                    variant="outline"
                                    asChild
                                    className="rounded-full shadow-sm transition-all hover:shadow-md"
                                >
                                    <a href="mailto:contact@queeniemella.cc">
                                        <Mail className="h-4 w-4" />
                                        contact@queeniemella.cc
                                    </a>
                                </Button>
                                <Button
                                    variant="outline"
                                    asChild
                                    className="rounded-full shadow-sm transition-all hover:shadow-md"
                                >
                                    <Link href="/privacy">
                                        {t('privacyPolicy')}
                                    </Link>
                                </Button>
                                <Button
                                    variant="outline"
                                    asChild
                                    className="rounded-full shadow-sm transition-all hover:shadow-md"
                                >
                                    <a href="https://status.zegraph.xyz" target="_blank" rel="noopener noreferrer">
                                        {t('apiStatus')}
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
}