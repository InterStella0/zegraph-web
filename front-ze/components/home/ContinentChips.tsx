'use client'
import {ContinentStatistics} from "types/players";

// Same continent → color mapping as PlayerContinentCounter, kept in sync so
// continents look the same everywhere on the site. Values must stay 6-digit hex
// because the chip background is derived by appending an alpha byte.
const CONTINENT_COLORS: Record<string, string> = {
    "North America": "#4CAF50",
    "South America": "#8BC34A",
    "Europe": "#2196F3",
    "Asia": "#F44336",
    "Africa": "#FF9800",
    "Oceania": "#9C27B0",
    "Antarctica": "#00BCD4",
    "Seven seas (open ocean)": "#00e1ff",
};
const FALLBACK_COLOR = "#9E9E9E";

export default function ContinentChips({continentData}: {continentData: ContinentStatistics}) {
    const sorted = [...continentData.continents].sort((a, b) => b.count - a.count);
    return (
        <div className="flex flex-wrap gap-1.5 mt-3">
            {sorted.map(continent => {
                const color = CONTINENT_COLORS[continent.name] ?? FALLBACK_COLOR;
                return (
                    <div
                        key={continent.name}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                        style={{backgroundColor: `${color}14`}}
                    >
                        <span className="h-2 w-2 rounded-full shrink-0" style={{backgroundColor: color}} />
                        <span className="text-xs text-muted-foreground">{continent.name}</span>
                        <span className="text-xs font-semibold tabular-nums">{continent.count.toLocaleString()}</span>
                    </div>
                );
            })}
        </div>
    );
}
