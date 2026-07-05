'use client'

import { GuideSortType } from 'types/guides';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from 'components/ui/select';
import { useTranslations } from 'next-intl';

interface SortFilterProps {
    value: GuideSortType;
    onChange: (value: GuideSortType) => void;
}

const sortOptions: { value: GuideSortType; labelKey: string }[] = [
    { value: 'TopRated', labelKey: 'sortTopRated' },
    { value: 'Newest', labelKey: 'sortNewest' },
    { value: 'Oldest', labelKey: 'sortOldest' },
    { value: 'MostDiscussed', labelKey: 'sortMostDiscussed' },
];

export default function SortFilter({ value, onChange }: SortFilterProps) {
    const t = useTranslations('guides');
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t('sortBy')} />
            </SelectTrigger>
            <SelectContent>
                {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
