'use client'
import {useLocale, useTranslations} from "next-intl";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {Info} from "lucide-react";
import {Card, CardContent} from "components/ui/card";
import {Button} from "components/ui/button";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";

dayjs.extend(relativeTime);

export default function ServerTrackingSince({ trackingSince }: { trackingSince: string | null }) {
    const t = useTranslations('servers.content');
    const locale = useLocale();

    if (!trackingSince) return null;

    const date = new Date(trackingSince);
    const formatted = date.toLocaleDateString(locale, {
        year: 'numeric', month: 'short', day: 'numeric'
    });

    return (
        <Card className="h-full">
            <CardContent className="p-0">
                <div className="flex flex-row justify-between items-center gap-2">
                    <h3 className="text-sm md:text-base font-bold truncate">
                        {t('trackingSince')}
                    </h3>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Info className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t('trackingSinceTooltip')}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
                <p className="mt-2">{formatted}</p>
                {/* fromNow() is time-of-render dependent, so server and client can disagree */}
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {dayjs(trackingSince).fromNow()}
                </p>
            </CardContent>
        </Card>
    );
}
