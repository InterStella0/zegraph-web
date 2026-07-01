import {Badge} from "components/ui/badge";
import {CommunityBase, Server} from "types/community";
import {Dispatch} from "react";
import {Gamepad2} from "lucide-react";

export const GAME_META: Record<string, { label: string; className: string }> = {
    "240":      { label: "CS:S",  className: "border-blue-500/40 text-blue-500" },
    "730_csgo": { label: "CS:GO", className: "border-amber-500/40 text-amber-500" },
    "730_cs2":  { label: "CS2",   className: "border-green-500/40 text-green-500" },
};

export default function ServerIndicator(
    { server, setDisplayCommunity }
    : { server: Server; setDisplayCommunity: Dispatch<boolean> | null }
) {
    if (!server) return null;

    const isClickable = setDisplayCommunity !== null;
    const gameMeta = server.game ? GAME_META[server.game] : undefined;
    return (
        <div
            className={`p-2 rounded-lg transition-all duration-200 ${
                isClickable
                    ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0 hover:scale-[1.01]'
                    : ''
            }`}
            onClick={() => setDisplayCommunity?.(true)}
        >
            <div className="flex flex-row gap-2 items-center">
                <Badge
                    variant="default"
                    className="max-w-[120px] h-6 px-2 bg-primary text-primary-foreground transition-transform duration-200 hover:scale-105"
                >
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                        {server.community_shorten_name || server.community_name}
                    </span>
                </Badge>
                <span className="text-muted-foreground text-xs">
                    /
                </span>
                <Badge
                    variant="outline"
                    className="md:max-w-36 max-sm:max-w-30  h-6 px-2 transition-transform duration-200 hover:scale-105"
                >
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap truncate text-xs">
                        {server.name}
                    </span>
                </Badge>
                {gameMeta && (
                    <Badge
                        variant="outline"
                        className={`h-6 px-2 transition-transform duration-200 hover:scale-105 ${gameMeta.className}`}
                    >
                        <Gamepad2 />
                        <span className="whitespace-nowrap text-xs">{gameMeta.label}</span>
                    </Badge>
                )}
            </div>
        </div>
    );
}