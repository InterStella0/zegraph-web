'use client';
import {useState} from 'react';
import {ChevronDown, Users} from 'lucide-react';
import {Community} from 'types/community';
import {Button} from 'components/ui/button';
import {Checkbox} from 'components/ui/checkbox';
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from 'components/ui/command';
import {Popover, PopoverContent, PopoverTrigger} from 'components/ui/popover';

type Props = {
    communities: Community[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    maxSelected: number;
};

export default function CommunityMultiSelect({communities, selectedIds, onChange, maxSelected}: Props) {
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
                    {selectedIds.length} {selectedIds.length === 1 ? 'community' : 'communities'}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-64" align="end">
                <Command>
                    <CommandInput placeholder="Search communities..." />
                    <CommandList>
                        <CommandEmpty>No communities found.</CommandEmpty>
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
