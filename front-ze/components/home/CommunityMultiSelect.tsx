'use client';
import {useState} from 'react';
import {ChevronDown, Users} from 'lucide-react';
import {Button} from 'components/ui/button';
import {Checkbox} from 'components/ui/checkbox';
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from 'components/ui/command';
import {Popover, PopoverContent, PopoverTrigger} from 'components/ui/popover';
import {useTranslations} from 'next-intl';

type Props = {
    communities: {id: string, name: string}[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    maxSelected: number;
};

export default function CommunityMultiSelect({communities, selectedIds, onChange, maxSelected}: Props) {
    const t = useTranslations('home');
    const [open, setOpen] = useState(false);
    const atLimit = selectedIds.length >= maxSelected;

    const toggle = (id: string) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(sId => sId !== id));
        } else if (!atLimit) {
            onChange([...selectedIds, id]);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    {t('communityCount', {count: selectedIds.length})}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-64" align="end">
                <Command>
                    <CommandInput placeholder={t('searchCommunities')} />
                    <CommandList>
                        <CommandEmpty>{t('noCommunitiesFound')}</CommandEmpty>
                        <CommandGroup>
                            {communities.map(community => {
                                const checked = selectedIds.includes(community.id);
                                const disabled = !checked && atLimit;
                                return (
                                    <CommandItem
                                        key={community.id}
                                        value={community.name}
                                        disabled={disabled}
                                        onSelect={() => toggle(community.id)}
                                    >
                                        <Checkbox checked={checked} disabled={disabled} className="pointer-events-none" />
                                        <span className="truncate">{community.name}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
