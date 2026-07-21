import { PlayerAvatar } from "./PlayerAvatar";
import {secondsToHours} from "utils/generalUtils";
import {useTranslations, useLocale} from "next-intl";
import {PlayerTableRank, RankMode} from "types/players";
import {Server} from "types/community";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";

const PlayerListItem = ({ player, mode = 'Total', server }: { player: PlayerTableRank, mode: RankMode, server: Server}) => {
    const t = useTranslations('players.listItem');
    const tCommon = useTranslations('common');
    const locale = useLocale();
    return (
    <div className="flex items-center gap-3 rounded-md mb-2 border border-border p-3 transition-all duration-200 hover:bg-accent/50">
        <div className="flex-shrink-0">
            <PlayerAvatar uuid={player.id} name={player.name} width={40} height={40} anonymous={player.is_anonymous} />
        </div>
        {player.is_anonymous ? (
            <div className="flex-1 min-w-0">
                <div className="font-medium">{t('anonymous')}</div>
                <div className="text-sm text-muted-foreground">{t('ranked', {rank: tCommon('ordinal', {n: player.rank})})}</div>
            </div>
        ) : (
            <div className="flex-1 min-w-0">
                <HoverPrefetchLink
                    href={`/servers/${server.gotoLink}/players/${player.id}`}
                    className="hover:underline"
                >
                    <div className="font-medium max-w-[25rem] max-sm:max-w-[9rem] truncate">{player.name}</div>
                </HoverPrefetchLink>
                <div className="text-sm max-sm:text-xs text-muted-foreground">{t('ranked', {rank: tCommon('ordinal', {n: player.rank})})} </div>
            </div>
        )}
        <div className="flex items-center gap-2">
            <span className="text-xl max-sm:text-sm text-primary font-semibold">
                {t('hoursShort', {hours: secondsToHours(player[`${mode.toLowerCase()}_playtime`], locale)})}
            </span>
        </div>
    </div>
    );
};

export default PlayerListItem;
