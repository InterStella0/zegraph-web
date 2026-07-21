'use client'
import {useState} from 'react';
import {Search, Loader2} from 'lucide-react';
import {SortByIndex} from "../../app/servers/[server_slug]/maps/MapsSearchIndex.tsx";
import {ServerMap} from "types/maps.ts";
import {Input} from "components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "components/ui/select";
import {Popover, PopoverContent, PopoverTrigger} from "components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandItem, CommandList} from "components/ui/command";
import {useTranslations} from 'next-intl';


export default function MapsSearchControls({
    searchInput,
    setSearchInput,
    setSearchTerm,
    setPage,
    sortBy,
    setSortBy,
    autocompleteOptions,
    autocompleteLoading,
}: {
    searchInput: string,
    setSearchInput: (searchInput: string) => void,
    setSearchTerm: (searchTerm: string) => void,
    setPage: (page: number) => void,
    sortBy: SortByIndex,
    setSortBy: (sortBy: SortByIndex) => void,
    autocompleteOptions: ServerMap[],
    autocompleteLoading: boolean,

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
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-8">
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
                <div className="md:col-span-4">
                    <Select
                        value={sortBy}
                        onValueChange={(value: SortByIndex) => {
                            setSortBy(value);
                            setPage(0);
                        }}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('sortBy')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="LastPlayed">{t('recentlyPlayed')}</SelectItem>
                            <SelectItem value="HighestCumHour">{t('cumulativeHours')}</SelectItem>
                            <SelectItem value="UniquePlayers">{t('uniquePlayers')}</SelectItem>
                            <SelectItem value="FrequentlyPlayed">{t('frequentlyPlayed')}</SelectItem>
                            <SelectItem value="HighestHour">{t('highestHours')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
