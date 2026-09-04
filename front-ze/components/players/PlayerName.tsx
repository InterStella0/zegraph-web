import {useTranslations} from "next-intl";

type PlayerNameProps = {
    name: string,
    /** The row is masked for this viewer — show "Anonymous" instead of the name. */
    isAnonymous?: boolean,
    /** The player is anonymized for this community, but you are allowed to see the real name.
     *  Shows the name with a muted "(Hidden)" so a player who just anonymized themselves doesn't
     *  read their own visible name as the toggle having failed. */
    hiddenFromOthers?: boolean,
    className?: string,
}

/**
 * The single place a player's name is turned into display text. A plain <span>, so it drops into
 * the existing truncating/ellipsis wrappers without changing any layout.
 */
export function PlayerName({ name, isAnonymous = false, hiddenFromOthers = false, className }: PlayerNameProps) {
    const t = useTranslations('common');

    if (isAnonymous) {
        return <span className={className}>{t('anonymous')}</span>;
    }
    if (!hiddenFromOthers) {
        return <span className={className}>{name}</span>;
    }
    return (
        <span className={className} title={t('hiddenHint')}>
            {name}
            <span className="ml-1 font-normal text-muted-foreground">{t('hidden')}</span>
        </span>
    );
}

export default PlayerName;
