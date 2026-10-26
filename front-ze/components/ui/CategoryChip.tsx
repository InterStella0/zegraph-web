'use client'
import { Badge } from "components/ui/badge";
import { cn } from "components/lib/utils";
import {useTranslations} from 'next-intl';
import {useHydrated} from "lib/hooks/useHydrated";
import type {MapPlayed} from "types/maps";

const CATEGORY_STYLES = {
    'casual': 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
    'tryhard': 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
    'mixed': 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    'lasers': 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400',
    'no noms': 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
};

export default function CategoryChip({ category, size = "medium", ...other }) {
    const t = useTranslations('maps.category');
    const isClient = useHydrated();
    const styleClass = CATEGORY_STYLES[category] || 'border-muted-foreground bg-muted text-muted-foreground';
    const label = CATEGORY_STYLES[category] ? t(category === 'no noms' ? 'noNoms' : category) : category;

    if (!isClient) {
        return (
            <Badge variant="outline" className="font-medium">
                {label}
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className={cn(
                styleClass,
                "font-medium",
                size === "small" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1",
                other.className
            )}
            title={other.title || t('playerType', {category: label})}
            {...other}
        >
            {label}
        </Badge>
    );
}

/** The play-style, lasers and no-noms chips of a map. */
export function MapCategoryChips({ map }: { map: Pick<MapPlayed, 'is_casual' | 'is_tryhard' | 'has_lasers' | 'no_noms'> }) {
    const t = useTranslations('maps.table');
    return <>
        {map.is_casual && !map.is_tryhard && <CategoryChip category="casual" size="small" />}
        {map.is_tryhard && !map.is_casual && <CategoryChip category="tryhard" size="small" />}
        {map.is_tryhard && map.is_casual && <CategoryChip category="mixed" size="small" />}
        {map.has_lasers && <CategoryChip category="lasers" title={t('lasersTitle')} size="small" />}
        {map.no_noms && <CategoryChip category="no noms" title={t('noNomsTitle')} size="small" />}
    </>
}
