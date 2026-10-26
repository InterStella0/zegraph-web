'use client'
import {useTranslations} from 'next-intl';
import {useState} from "react";
import {Skeleton} from "components/ui/skeleton";
import {
    fetchApiServerUrl,
    formatFlagName,
    ICE_FILE_ENDPOINT,
    InfractionFlags,
    InfractionInt,
    range,
} from "utils/generalUtils";
import { Card, CardContent } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Button } from "components/ui/button";
import { Alert, AlertDescription } from "components/ui/alert";
import {
    Dialog,
    DialogContent,
} from "components/ui/dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "components/ui/tooltip";
import dayjs from "lib/dayjs";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import {useResource} from "lib/hooks/useResource";
import { Ban, RefreshCw, Loader2 } from "lucide-react";
import {PlayerInfraction, PlayerInfractionUpdate} from "types/players.ts";
import Image from "next/image";
import {periodBounds, usePeriod} from "components/period/Period";
import {usePlayerStatSeed} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch";
import {withErrorCatch} from "components/common/withErrorCatch";
import {PeriodTitle, ServerPlayerProps, useServerPlayer} from "./common";

export function InfractionModal({ infraction, onClose }){
    const t = useTranslations('players.infractions');
    const isEmpty = infraction === null
    const iframeSource = `${infraction?.source}/infractions/${infraction?.id}/`
    return (
        <Dialog open={!isEmpty} onOpenChange={() => onClose()}>
            <DialogContent className="w-full !max-w-none h-[100vh] p-0 left-0 bottom-0 translate-x-0 !translate-y-[-50%] [&_svg:not([class*='size-'])]:size-5 [&>button]:right-6 [&>button]:top-7 [&>button]:left-auto [&>button]:z-3">
                {!isEmpty && (
                    <div className="w-[100vw] flex flex-col h-full relative">
                        <Alert className="absolute z-1 left-5 right-5 top-5 w-[86%]">
                            <AlertDescription>
                                {t('iframeNotice', {source: infraction.source?.replace("https://", "") ?? ''})}
                            </AlertDescription>
                        </Alert>
                        <div className="flex-1 relative w-[100vw]">
                            <iframe
                                className="w-full h-full"
                                src={iframeSource}
                            />
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

const steamIdSearch = (playerId: string | null) => `&advSearch=${playerId}&advType=steamid`;
const allSearch = (playerId: string | null) => `=true&s=${playerId}&m=1`;
const NIDE_SEARCH: Record<string, (playerId: string | null) => string> = {
    "https://bans.nide.gg/index.php?p=banlist": steamIdSearch,
    "https://bans.nide.gg/index.php?p=commslist": steamIdSearch,
    "https://kbans.nide.gg/index.php?all": allSearch,
    "https://ebans.nide.gg/index.php?all": allSearch,
};

export function openInfraction<T extends { source: string }>(row: T, playerId: string | null, view: (row: T) => void) {
    const openTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
    if (row.source?.startsWith("https://bans.cola-team.es")) {
        openTab(row.source);
    } else if (row.source?.includes("nide.gg")) {
        const search = NIDE_SEARCH[row.source];
        if (search) openTab(`${row.source}${search(playerId)}`);
    } else {
        view(row);
    }
}

export function withInfractionFlags(infractions) {
    return infractions.map(e => {
        if (!(e.flags instanceof InfractionInt))
            e.flags = new InfractionInt(e.flags, e.source);
        return e;
    });
}

function InfractionCard({ row, onClick }: { row: PlayerInfraction, onClick: () => void }) {
    const t = useTranslations('players.infractions');
    const toDayjs = useLocalDayjs();
    const flags = row.flags as InfractionInt;
    const restrictions = flags.getAllRestrictedFlags();
    return (
        <Card
            className="mb-3 cursor-pointer border transition-all hover:border-primary hover:bg-accent hover:-translate-y-0.5 hover:shadow-md"
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-center mb-3">
                    {row.admin_avatar &&
                        <Image
                            src={ICE_FILE_ENDPOINT.replace('{}', row.admin_avatar)}
                            title={`${row.by}'s Avatar`}
                            alt={row.by}
                            width={28}
                            height={28}
                            className="w-7 h-7 mr-4 rounded-[8%]"
                        />
                    }
                    <p className="text-sm font-semibold">
                        {flags.hasFlag(InfractionFlags.SYSTEM) ? t('system') : row.by}
                    </p>
                </div>

                <p className={`text-sm ${row.reason ? '' : 'italic text-muted-foreground'}`}>
                    {row.reason || t('noReason')}
                </p>

                <div className="flex justify-between items-center flex-wrap mt-2 gap-2">
                    <div className="flex flex-wrap gap-1">
                        {restrictions.length > 0 ? restrictions.map((flagName: string) => (
                            <Badge key={flagName} variant="destructive" className="text-xs h-6">
                                {formatFlagName(flagName)}
                            </Badge>
                        )) : (
                            <span className="text-xs text-muted-foreground italic">
                                {t('noRestrictions')}
                            </span>
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {toDayjs(row.infraction_time).format('lll')}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

function PlayerInfractionRecordDisplay({ serverPlayerPromise }: ServerPlayerProps) {
    const t = useTranslations('players.infractions');
    const { server, playerId } = useServerPlayer(serverPlayerPromise);
    const { seed, idle } = usePlayerStatSeed<PlayerInfraction[]>('infractions');
    const [refreshCount, setRefreshCount] = useState(0);
    const stored = () => fetchApiServerUrl(server.id, `/players/${playerId}/infractions`);
    // Re-scrapes the ban sites; if that fails, the stored list is shown instead.
    const rescrape = () => fetchApiServerUrl(server.id, `/players/${playerId}/infraction_update`)
        .then((resp: PlayerInfractionUpdate) => resp.infractions.sort((a, b) => dayjs(b.infraction_time).diff(dayjs(a.infraction_time))), stored);
    // A refresh goes through the same resource, so it cancels a first load still in flight instead of racing it.
    // keepError keeps "no records" up while refreshing after a failed first load, rather than the skeleton.
    const { data, loading, error } = useResource<PlayerInfraction[]>(
        () => !playerId || (idle && !refreshCount) ? null : (refreshCount ? rescrape() : stored()).then(withInfractionFlags),
        [server.id, playerId, refreshCount], { initial: seed ? withInfractionFlags(seed) : undefined, keepData: true, keepError: true });
    const updating = loading && refreshCount > 0;
    const [viewInfraction, setViewInfraction] = useState(null);
    const { period } = usePeriod();
    const bounds = period ? periodBounds(period) : null;
    const infractions = (data ?? []).filter(row => {
        if (!bounds) return true;
        if (!row.infraction_time) return false;
        const time = new Date(row.infraction_time);
        return time >= bounds.start && time < bounds.end;
    });

    return (
        <Card className="min-h-[460px] p-4">
            <div className="flex flex-row justify-between items-center mb-4">
                <PeriodTitle title={t('title')} />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setRefreshCount(n => n + 1)} disabled={updating}>
                            {updating ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{t('update')}</p>
                    </TooltipContent>
                </Tooltip>
            </div>

            {loading && !data && !error ? (
                <div className="h-[380px] overflow-hidden pt-2 space-y-3">
                    {range(3).map(i => <Skeleton key={i} className="h-[110px] w-full rounded-xl" />)}
                </div>
            ) : infractions.length === 0 ? (
                <div className="flex justify-center items-center h-[380px] text-muted-foreground flex-col gap-2">
                    <Ban className="w-8 h-8 opacity-50" />
                    <h3 className="text-xl font-semibold">
                        {t('noRecords')}
                    </h3>
                </div>
            ) : (
                <>
                    <InfractionModal infraction={viewInfraction} onClose={() => setViewInfraction(null)} />
                    <div className="h-[380px] overflow-y-auto pt-2">
                        {infractions.map(row => (
                            <InfractionCard key={row.id} row={row} onClick={() => openInfraction(row, playerId, setViewInfraction)} />
                        ))}
                    </div>
                </>
            )}
        </Card>
    );
}

export default withErrorCatch(PlayerInfractionRecordDisplay, t => t('players.infractions.loadError'))
