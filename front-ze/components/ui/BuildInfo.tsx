'use client'
import { GitCommitHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";

const REPO_URL = "https://github.com/InterStella0/zegraph-web";

// Both are inlined at build time by next.config.ts, so they are the same string on the server and
// on the client -- reading them at module scope is safe.
const COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

// Fixed UTC rather than a locale- or timezone-dependent render, which would hydrate differently
// from what the server produced.
function formatBuildTime(iso: string): string {
    if (!iso) return "";
    return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

export default function BuildInfo() {
    const t = useTranslations('footer');

    if (!COMMIT) return null;

    const builtAt = formatBuildTime(BUILD_TIME);

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    {/* Ghost and unshadowed, unlike its siblings in this row: it is metadata, not
                        another place to navigate to. */}
                    <Button
                        variant="ghost"
                        asChild
                        className="rounded-full text-xs text-muted-foreground transition-all hover:text-foreground"
                    >
                        <a
                            href={`${REPO_URL}/commit/${COMMIT}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <GitCommitHorizontal className="h-4 w-4" />
                            {t('build', { sha: COMMIT.slice(0, 7) })}
                        </a>
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p className="font-mono text-xs">{COMMIT}</p>
                    {builtAt && (
                        <p className="text-muted-foreground">
                            {t('builtAt', { date: builtAt })}
                        </p>
                    )}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
