import {useTranslations} from "next-intl";
import {Bot} from "lucide-react";
import {Badge} from "components/ui/badge";
import {cn} from "components/lib/utils";

type PlayerNameProps = {
    name: string,
    isAnonymous?: boolean,
    hiddenFromOthers?: boolean,
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

export function PlayerName({ name, isAnonymous = false, hiddenFromOthers = false, isBot = false, className }: PlayerNameProps) {
    const t = useTranslations('common');

    if (isAnonymous) {
        return <span className={className}>{t('anonymous')}</span>;
    }
    return (
        <span className={className} title={hiddenFromOthers ? t('hiddenHint') : undefined}>
            {name}
            {hiddenFromOthers && <span className="ml-1 font-normal text-muted-foreground">{t('hidden')}</span>}
            {isBot && <BotBadge/>}
        </span>
    );
}

export default PlayerName;
