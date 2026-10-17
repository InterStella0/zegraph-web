'use client'
import {ReactNode, useState} from 'react';
import {Search, Loader2} from 'lucide-react';
import {SortByIndex} from "../../app/servers/[server_slug]/maps/MapsSearchIndex.tsx";
import {Input} from "components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "components/ui/select";
import {Popover, PopoverContent, PopoverTrigger} from "components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandItem, CommandList} from "components/ui/command";
import {useTranslations} from 'next-intl';

const SORT_LABELS: Record<SortByIndex, string> = {
    LastPlayed: 'recentlyPlayed',
    HighestCumHour: 'cumulativeHours',
    UniquePlayers: 'uniquePlayers',
    FrequentlyPlayed: 'frequentlyPlayed',
    HighestHour: 'highestHours',
};
const DEFAULT_SORT_OPTIONS = Object.keys(SORT_LABELS) as SortByIndex[];


export default function MapsSearchControls({
    searchInput,
    setSearchInput,
    setSearchTerm,
    setPage,
    sortBy,
    setSortBy,
    autocompleteOptions,
    autocompleteLoading,
    sortOptions = DEFAULT_SORT_OPTIONS,
    children,
}: {
    searchInput: string,
    setSearchInput: (searchInput: string) => void,
    setSearchTerm: (searchTerm: string) => void,
    setPage: (page: number) => void,
    sortBy: SortByIndex,
    setSortBy: (sortBy: SortByIndex) => void,
    autocompleteOptions: {map: string}[],
    autocompleteLoading: boolean,
    /** Extra controls placed after the sort select, e.g. a game filter. */
    children?: ReactNode,
    /** Sort choices to offer; defaults to all of them. */
    sortOptions?: SortByIndex[],

}) {
    const t = useTranslations('maps.searchControls');
    const [open, setOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const isOpen = open && autocompleteOptions.length > 0;

    const handleSelect = (value: string) => {
        setSearchInput(value);
        setSearchTerm(value);
        setPage(0);
        setOpen(false);
        setSelectedIndex(-1);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/ /g, '_');
        setSearchInput(value);
        setSelectedIndex(-1);
        if (value.trim()) {
            setOpen(true);
        } else {
            setOpen(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown' && isOpen) {
            e.preventDefault();
            setSelectedIndex(prev =>
                prev < autocompleteOptions.length - 1 ? prev + 1 : 0
            );
        } else if (e.key === 'ArrowUp' && isOpen) {
            e.preventDefault();
            setSelectedIndex(prev =>
                prev > 0 ? prev - 1 : autocompleteOptions.length - 1
            );
        } else if (e.key === 'Enter') {
            if (isOpen && selectedIndex >= 0) {
                handleSelect(autocompleteOptions[selectedIndex].map);
            } else {
                const value = searchInput.replace(/ /g, '_');
                setSearchInput(value);
                setSearchTerm(value);
                setPage(0);
                setOpen(false);
            }
        }
    };

    return (
        <div className="border border-border rounded-lg bg-card p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 min-w-0">
                    <Popover open={isOpen} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchInput}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    onFocus={() => {
                                        if (searchInput.trim() && autocompleteOptions.length > 0) {
                                            setOpen(true);
                                        }
                                    }}
                                    placeholder={t('searchMaps')}
                                    className="pl-10 pr-10"
                                />
                                {autocompleteLoading && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                            </div>
                        </PopoverTrigger>
                        <PopoverContent
                            className="p-0"
                            align="start"
                            style={{width: 'var(--radix-popover-trigger-width)'}}
                            onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                            <Command shouldFilter={false}>
                                <CommandList>
                                    <CommandEmpty>
                                        {autocompleteLoading ? t('loadingMaps') : t('noMapsFound')}
                                    </CommandEmpty>
                                    <CommandGroup>
                                        {autocompleteOptions.map((option, index) => (
                                            <CommandItem
                                                key={option.map}
                                                value={option.map}
                                                data-selected={index === selectedIndex}
                                                onSelect={() => handleSelect(option.map)}
                                            >
                                                <span className="font-medium">{option.map}</span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
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
