'use client'
import {ReactNode} from 'react';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "components/ui/select";
import {SuggestSearch, SuggestSearchState} from "components/ui/SuggestSearch";
import {useTranslations} from 'next-intl';

export type SortByIndex = "LastPlayed" | "HighestCumHour" | "UniquePlayers" | "FrequentlyPlayed" | "HighestHour"

const SORT_LABELS: Record<SortByIndex, string> = {
    LastPlayed: 'recentlyPlayed',
    HighestCumHour: 'cumulativeHours',
    UniquePlayers: 'uniquePlayers',
    FrequentlyPlayed: 'frequentlyPlayed',
    HighestHour: 'highestHours',
};
const DEFAULT_SORT_OPTIONS = Object.keys(SORT_LABELS) as SortByIndex[];

export type MapSuggestion = {map: string}

/** Map search options shared by the server and global map lists: at least one character, after 300ms. */
export const MAP_SUGGEST = {minChars: 1, suggestDelay: 300} as const

export default function MapsSearchControls({search, setPage, sortBy, setSortBy, sortOptions = DEFAULT_SORT_OPTIONS, children}: {
    search: SuggestSearchState<MapSuggestion>,
    setPage: (page: number) => void,
    sortBy: SortByIndex,
    setSortBy: (sortBy: SortByIndex) => void,
    children?: ReactNode,
    sortOptions?: SortByIndex[],
}) {
    const t = useTranslations('maps.searchControls');
    return (
        <div className="border border-border rounded-lg bg-card p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 min-w-0">
                    <SuggestSearch
                        search={search}
                        placeholder={t('searchMaps')}
                        empty={search.loading ? t('loadingMaps') : t('noMapsFound')}
                        itemValue={option => option.map}
                        format={value => value.replace(/ /g, '_')}
                        openWhileLoading={false}
                    />
                </div>
                <div className="md:shrink-0">
                    <Select
                        value={sortBy}
                        onValueChange={(value: SortByIndex) => {
                            setSortBy(value);
                            setPage(0);
                        }}
                    >
                        <SelectTrigger className="w-full md:w-fit">
                            <SelectValue placeholder={t('sortBy')} />
                        </SelectTrigger>
                        <SelectContent>
                            {sortOptions.map(option => (
                                <SelectItem key={option} value={option}>{t(SORT_LABELS[option])}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {children && <div className="md:shrink-0">{children}</div>}
            </div>
        </div>
    );
}
