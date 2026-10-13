'use client';
import {useState} from 'react';
import PopulationChartLoader from 'components/home/PopulationChartLoader';
import WherePlayersMap from 'components/home/WherePlayersMap';
import {ContinentStatistics} from 'types/players';

export default function HomePopulationRadar({continentsPromise}: {continentsPromise: Promise<ContinentStatistics | null>}) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={isExpanded ? 'lg:col-span-2' : undefined}>
                <PopulationChartLoader
                    isExpanded={isExpanded}
                    onToggleExpand={() => setIsExpanded(v => !v)}
                />
            </div>
            <div className={isExpanded ? 'lg:col-span-2' : undefined}>
                <WherePlayersMap continentsPromise={continentsPromise} />
            </div>
        </div>
    );
}
