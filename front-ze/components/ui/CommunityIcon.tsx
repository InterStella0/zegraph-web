import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar";
import {cn} from "components/lib/utils";
import {cleanDisplayName, graphemes} from "utils/format";

export const getServerAvatarText = (name: string) => {
    const words = cleanDisplayName(name ?? '').split(' ').filter(Boolean);
    if (words.length >= 2) return graphemes(words[0])[0] + graphemes(words[1])[0];
    return graphemes(words[0] ?? '').slice(0, 2).join('');
}

/** The community's short name when it fits a small tile ("GFL", "NiDE"), else initials of its full name. */
function iconText(name: string, shortName?: string | null) {
    const short = cleanDisplayName(shortName ?? '');
    if (short && !short.includes(' ') && graphemes(short).length <= 4) return short;
    return getServerAvatarText(name).toUpperCase();
}

/** Rounded-square community logo with a neutral text fallback. */
export function CommunityIcon({ name, shortName, iconUrl, className, textClassName }: {
    name: string,
    shortName?: string | null,
    iconUrl?: string | null,
    className?: string,
    textClassName?: string,
}) {
    return (
        <Avatar className={cn("size-10 rounded-md", className)}>
            {iconUrl && <AvatarImage src={iconUrl} alt={name} />}
            <AvatarFallback className={cn("rounded-md bg-muted text-foreground/80 font-semibold text-xs", textClassName)}>
                {iconText(name, shortName)}
            </AvatarFallback>
        </Avatar>
    );
}
