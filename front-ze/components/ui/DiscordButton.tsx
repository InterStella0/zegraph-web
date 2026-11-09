'use client'
import {SiDiscord} from "@icons-pack/react-simple-icons";
import {useFormatter, useTranslations} from "next-intl";
import {Suspense, use} from "react";
import {Button} from "components/ui/button";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {DISCORD_URL} from "./siteLinks";

function MemberCount({ membersPromise }: { membersPromise: Promise<number | null> }) {
    const members = use(membersPromise)
    const format = useFormatter()
    if (members === null) return null
    return <span className="text-sm font-semibold tabular-nums">{format.number(members, { notation: 'compact' })}</span>
}

export default function DiscordButton({ membersPromise }: { membersPromise: Promise<number | null> }) {
    const t = useTranslations('nav');
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="subtle" className="h-9 gap-1.5 px-2.5" asChild>
                    <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label={t('discordCta')}>
                        <SiDiscord className="h-4 w-4 text-[#5865F2]" />
                        <Suspense fallback={null}>
                            <MemberCount membersPromise={membersPromise} />
                        </Suspense>
                    </a>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>{t('discordCta')}</TooltipContent>
        </Tooltip>
    );
}
