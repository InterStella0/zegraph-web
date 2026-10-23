'use client'
import { GitCommitHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/ui/tooltip";
import { REPO_URL } from "./siteLinks";

const COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const BUILT_AT = BUILD_TIME && `${BUILD_TIME.slice(0, 16).replace("T", " ")} UTC`;

export default function BuildInfo() {
    const t = useTranslations('footer');
    if (!COMMIT) return null;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {/* Ghost and unshadowed, unlike its siblings in this row: it is metadata, not
                    another place to navigate to. */}
                <Button
                    variant="ghost"
                    asChild
                    className="rounded-full text-xs text-muted-foreground transition-all hover:text-foreground"
                >
                    <a href={`${REPO_URL}/commit/${COMMIT}`} target="_blank" rel="noopener noreferrer">
                        <GitCommitHorizontal className="h-4 w-4" />
                        {t('build', { sha: COMMIT.slice(0, 7) })}
                    </a>
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                <p className="font-mono text-xs">{COMMIT}</p>
                {BUILT_AT && (
                    <p className="text-muted-foreground">
                        {t('builtAt', { date: BUILT_AT })}
                    </p>
                )}
            </TooltipContent>
        </Tooltip>
    );
}
