import {Server} from "types/community";
import {Dispatch} from "react";
import {ChevronsUpDown} from "lucide-react";
import {GAMES} from "utils/games";
import {cn} from "components/lib/utils";
import {CommunityIcon} from "./CommunityIcon";

const GAME_COLORS: Record<string, string> = {
    "240":      "border-blue-500/40 text-blue-500",
    "730_csgo": "border-amber-500/40 text-amber-500",
    "730_cs2":  "border-green-500/40 text-green-500",
    "440":      "border-red-500/40 text-red-500",
};

export const GAME_META: Record<string, { label: string; className: string }> = Object.fromEntries(
    Object.entries(GAMES).map(([id, {label}]) => [id, {label, className: GAME_COLORS[id]}])
);

/** Coloured game label ("CS2") for the second line of a server row. */
export function GameLabel({ game, className }: { game?: string | null, className?: string }) {
    const meta = game ? GAME_META[game] : undefined;
    if (!meta) return null;
    return <span className={cn("shrink-0 font-semibold", meta.className, className)}>{meta.label}</span>;
}

/** The current server as logo + two lines: name on top, game and community underneath. */
export default function ServerIndicator(
    { server, setDisplayCommunity }
    : { server: Server; setDisplayCommunity: Dispatch<boolean> | null }
) {
    if (!server) return null;

    const isClickable = setDisplayCommunity !== null;
    const content = <>
        <CommunityIcon
            name={server.community_name}
            shortName={server.community_shorten_name}
            iconUrl={server.community_icon}
            className="size-8"
            textClassName="text-[10px]"
        />
        <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className="truncate text-sm font-semibold" title={server.name}>{server.name}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs">
                <GameLabel game={server.game} />
                <span className="truncate text-muted-foreground">{server.community_name}</span>
            </span>
        </span>
    </>;

    if (!isClickable) {
        return <div className="flex min-w-0 max-w-72 items-center gap-2.5 px-2 py-1.5">{content}</div>;
    }
    return (
        <button
            type="button"
            onClick={() => setDisplayCommunity(true)}
            className="flex min-w-0 max-w-72 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            {content}
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
    );
}
