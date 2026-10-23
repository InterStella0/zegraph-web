'use client'
import {SiDiscord} from "@icons-pack/react-simple-icons";
import {useTranslations} from "next-intl";
import {Button} from "components/ui/button";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {DISCORD_URL} from "./siteLinks";

export default function DiscordButton() {
    const t = useTranslations('nav');
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild>
                    <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label={t('discordCta')}>
                        <SiDiscord className="h-5 w-5 text-[#5865F2]" />
                    </a>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>{t('discordCta')}</TooltipContent>
        </Tooltip>
    );
}
