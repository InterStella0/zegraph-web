import { ReactNode } from "react";
import { Star, Coffee, Mail } from "lucide-react";
import Link from "next/link";
import BuildInfo from "./BuildInfo";
import FooterFab from "./FooterFab";
import ThemeToggle from "./ThemeToggle";
import LanguageToggle from "./LanguageToggle";
import IconLink from "./IconLink";
import { DISCORD_URL, REPO_URL } from "./siteLinks";
import {SiDiscord, SiGithub, SiSteam} from "@icons-pack/react-simple-icons";
import {Button} from "components/ui/button.tsx";
import {useTranslations} from "next-intl";

function PillButton({ children }: { children: ReactNode }) {
    return (
        <Button variant="outline" asChild className="rounded-full shadow-sm transition-all hover:shadow-md">
            {children}
        </Button>
    );
}

export default function Footer() {
    const t = useTranslations('footer');
    const socials = [
        { href: DISCORD_URL, ariaLabel: "Discord", tooltip: t('supportServer'), label: t('supportServer'), Icon: SiDiscord },
        { href: "https://steamcommunity.com/id/Stella667/", ariaLabel: "Steam", tooltip: "Steam: queeniemella", label: "queeniemella", Icon: SiSteam },
        { href: REPO_URL, ariaLabel: "GitHub", tooltip: "GitHub: InterStella0", label: "InterStella0", Icon: SiGithub },
        { href: "/donors", ariaLabel: "Donate", tooltip: t('supportZeGraph'), label: t('donate'), Icon: Coffee },
    ];

    return (
        <>
            <FooterFab />

            {/* Frosted like the header over a player's Steam profile background, which it would otherwise sit straight on. */}
            <footer className="relative mt-auto w-full overflow-hidden border-t-1 py-6 profile-bg:bg-background/60 profile-bg:backdrop-blur">
                <div className="container mx-auto max-w-6xl px-4">
                    <div className="mb-4 flex flex-col items-center justify-between gap-6 md:mb-3 md:flex-row">
                        <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 fill-primary text-primary" />
                            <p className="text-sm text-muted-foreground">
                                {t('copyright', {year: new Date().getFullYear()})}
                            </p>
                        </div>

                        <div className="flex items-center gap-1">
                            <ThemeToggle />
                            <LanguageToggle />
                            {socials.map(({ href, ariaLabel, tooltip, label, Icon }) => (
                                <div key={ariaLabel} className="flex items-center">
                                    <IconLink href={href} ariaLabel={ariaLabel} tooltip={tooltip} icon={<Icon className="h-5 w-5 text-primary" />} />
                                    <span className="ml-1 hidden text-xs text-foreground md:block">{label}</span>
                                </div>
                            ))}
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
                                <PillButton>
                                    <a href="mailto:contact@queeniemella.cc">
                                        <Mail className="h-4 w-4" />
                                        contact@queeniemella.cc
                                    </a>
                                </PillButton>
                                <PillButton>
                                    <Link href="/privacy" prefetch={false}>
                                        {t('privacyPolicy')}
                                    </Link>
                                </PillButton>
                                <PillButton>
                                    <a href="https://status.zegraph.xyz" target="_blank" rel="noopener noreferrer">
                                        {t('apiStatus')}
                                    </a>
                                </PillButton>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
}
