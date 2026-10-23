import {Tabs, TabsList, TabsTrigger} from 'components/ui/tabs';
import {Dispatch} from "react";
import {useTranslations} from 'next-intl';

export type FilterTypes = "casual" | "tryhard" | "available" | "playing" | "favorites" | "lasers" | "all"
const FILTER_LABELS: Record<FilterTypes, string> = {
    all: 'allMaps', casual: 'casual', tryhard: 'tryhard', lasers: 'hasLasers',
    available: 'availableNow', playing: 'liveNow', favorites: 'favorites',
}
/** The API `filter` value for each tab; `all` sends none. */
export const FILTER_MODES: Partial<Record<FilterTypes, string>> = {
    casual: 'Casual', tryhard: 'TryHard', lasers: 'HasLaser', available: 'Available', playing: 'Playing', favorites: 'Favorite',
}
const DEFAULT_TABS: FilterTypes[] = ['all', 'casual', 'tryhard', 'lasers', 'available', 'favorites']

export default function MapsFilterTabs({
    filterTab,
    setFilterTab,
    setPage,
    tabs = DEFAULT_TABS,
}: { filterTab: FilterTypes, setFilterTab: Dispatch<FilterTypes>, setPage: Dispatch<number>, tabs?: FilterTypes[] }) {
    const t = useTranslations('maps.filter');
    return (
        <div className="border border-border rounded-lg bg-card mb-6">
            <Tabs
                value={filterTab}
                onValueChange={(newValue: FilterTypes) => {
                    setFilterTab(newValue);
                    setPage(0);
                }}
            >
                <TabsList className="w-full justify-start overflow-x-auto md:overflow-visible bg-transparent p-0 h-auto rounded-none border-b border-border">
                    {tabs.map(value => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium text-sm px-4 py-3"
                        >
                            {t(FILTER_LABELS[value])}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </div>
    );
}
