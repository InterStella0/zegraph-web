'use client'

import { GuideCategory, GuideCategoryType } from 'types/guides';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from 'components/ui/select';
import { useTranslations } from 'next-intl';
import { guideCategoryLabel } from './categoryUtils';

interface CategoryFilterProps {
    value: string;
    onChange: (value: string) => void;
}

export default function CategoryFilter({ value, onChange }: CategoryFilterProps) {
    const t = useTranslations('guides');
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder={t('filterByCategory')} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">{t('allCategories')}</SelectItem>
                {Object.entries(GuideCategory).map(([key, label]) => (
                    <SelectItem key={key} value={label}>
                        {guideCategoryLabel(t, label)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
