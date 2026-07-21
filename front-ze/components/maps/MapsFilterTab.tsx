import {Tabs, TabsList, TabsTrigger} from 'components/ui/tabs';
import {Dispatch} from "react";
import {useTranslations} from 'next-intl';

export type FilterTypes = "casual" | "tryhard" | "available" | "favorites" | "lasers" | "all"
export default function MapsFilterTabs({
    filterTab,
    setFilterTab,
    setPage,
}: { filterTab: FilterTypes, setFilterTab: Dispatch<FilterTypes>, setPage: Dispatch<number> }) {
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
                    <TabsTrigger
                        value="all"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium text-sm px-4 py-3"
                    >
                        {t('allMaps')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="casual"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium text-sm px-4 py-3"
                    >
                        {t('casual')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="tryhard"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium text-sm px-4 py-3"
                    >
                        {t('tryhard')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="lasers"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium text-sm px-4 py-3"
                    >
                        {t('hasLasers')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="available"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium text-sm px-4 py-3"
                    >
                        {t('availableNow')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="favorites"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium text-sm px-4 py-3"
                    >
                        {t('favorites')}
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    );
}
