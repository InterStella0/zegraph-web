'use client'
import { ContinentStatistics } from "types/players.ts";

export default function PlayerContinentCounter({ continentData, truncate = 3 }: { continentData: ContinentStatistics, truncate?: number }) {
    const continentColors = {
        "North America": "#4CAF50",
        "South America": "#8BC34A",
        "Europe": "#2196F3",
        "Asia": "#F44336",
        "Africa": "#FF9800",
        "Oceania": "#9C27B0",
        "Antarctica": "#00BCD4",
        "Seven seas (open ocean)": "#00e1ff",
    };

    const sortedContinents = continentData?.continents
        ? [...continentData.continents].sort((a, b) => b.count - a.count)
        : [];

    return (
        <div className="mt-2">
            <div className="space-y-3">
                {sortedContinents.slice(0, truncate).map((continent) => {
                    const percentage = ((continent.count / continentData.contain_countries) * 100).toFixed(2);
                    const color = continentColors[continent.name] || 'hsl(var(--primary))';

                    return (
                        <div key={continent.name}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">
                                    {continent.name}
                                </span>
                                <span className="text-sm text-muted-foreground font-semibold">
                                    {percentage}%
                                </span>
                            </div>
                            <div className="relative h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: `${color}20` }}>
                                <div
                                    className="h-full transition-all duration-500 ease-out rounded-full"
                                    style={{
                                        width: `${percentage}%`,
                                        backgroundColor: color,
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
