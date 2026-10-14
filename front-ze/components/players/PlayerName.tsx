import {useTranslations} from "next-intl";
import {Bot} from "lucide-react";
import {Badge} from "components/ui/badge";
import {cn} from "components/lib/utils";

type PlayerNameProps = {
    name: string,
    /** The row is masked for this viewer — show "Anonymous" instead of the name. */
    isAnonymous?: boolean,
    /** The player is anonymized for this community, but you are allowed to see the real name.
     *  Shows the name with a muted "(Hidden)" so a player who just anonymized themselves doesn't
     *  read their own visible name as the toggle having failed. */
    hiddenFromOthers?: boolean,
    /** The player is flagged as a bot. Shows a "Bot" badge after the name. */
    isBot?: boolean,
    className?: string,
}

export function BotBadge({ className }: { className?: string }) {
    const t = useTranslations('common');
    return (
        <Badge variant="secondary" className={cn("ml-1.5 align-middle rounded-md", className)} title={t('botHint')}>
            <Bot/>
            {t('bot')}
        </Badge>
    );
}

/**
 * The single place a player's name is turned into display text. A plain <span>, so it drops into
 * the existing truncating/ellipsis wrappers without changing any layout.
 */
export function PlayerName({ name, isAnonymous = false, hiddenFromOthers = false, isBot = false, className }: PlayerNameProps) {
    const t = useTranslations('common');

    if (isAnonymous) {
        return <span className={className}>{t('anonymous')}</span>;
    }
    if (!hiddenFromOthers) {
        return <span className={className}>{name}{isBot && <BotBadge/>}</span>;
    }
    return (
        <span className={className} title={t('hiddenHint')}>
            {name}
            <span className="ml-1 font-normal text-muted-foreground">{t('hidden')}</span>
            {isBot && <BotBadge/>}
        </span>
    );
}

export default PlayerName;
