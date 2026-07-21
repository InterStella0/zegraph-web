import { Circle } from 'lucide-react';
import { PlayerAvatar } from "./PlayerAvatar";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";

type statusType = 'online' | 'offline' | 'away' | 'playing'
const getStatusColor = (status: statusType): string => {
    switch (status) {
        case 'online':
        case 'playing':
            return 'hsl(var(--success))';
        case 'away':
            return 'hsl(var(--warning))';
        case 'offline':
            return 'hsl(var(--muted-foreground))';
        default:
            return 'hsl(var(--muted-foreground))';
    }
};

const getRankColor = (rank: number): string => {
    if (rank === 1) return '#ffd700';
    if (rank === 2) return '#c0c0c0';
    if (rank === 3) return '#cd7f32';
    return '';
};

const LeaderboardItem = ({ item, server }) => (
    <div className="py-2 rounded-md hover:bg-accent hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
        <div className="flex items-center w-full gap-4">
            <span
                className="text-xl font-bold min-w-[30px] text-center"
                style={{ color: getRankColor(item.rank) || 'inherit' }}
            >
                {item.rank}
            </span>
            <div className="relative">
                <PlayerAvatar uuid={item.id} name={item.name} />
                <Circle
                    className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full"
                    style={{ color: getStatusColor(item.status) }}
                    fill="currentColor"
                />
            </div>
            <HoverPrefetchLink
                href={`/servers/${server.gotoLink}/players/${item.id}`}
                className="flex-1 hover:underline max-sm:max-w-[9rem] max-w-[10rem] truncate max-sm:text-sm"
            >
                {item.name}
            </HoverPrefetchLink>
            <span className="text-primary font-semibold max-sm:text-sm ms-auto min-sm:pr-2.5">
                {item.time}hr
            </span>
        </div>
    </div>
);

export default LeaderboardItem;
