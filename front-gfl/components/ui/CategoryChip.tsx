'use client'
import { Badge } from "components/ui/badge";
import { cn } from "components/lib/utils";
import { useEffect, useState } from "react";

const CATEGORY_STYLES = {
    'casual': 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
    'tryhard': 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
    'mixed': 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    'lasers': 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400',
    'no noms': 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
};

export default function CategoryChip({ category, size = "medium", ...other }) {
    const [isClient, setIsClient] = useState(false);
    const styleClass = CATEGORY_STYLES[category] || 'border-muted-foreground bg-muted text-muted-foreground';

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return (
            <Badge variant="outline" className="font-medium">
                {category}
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
            title={other.title || `Player Type: ${category}`}
            {...other}
        >
            {category}
        </Badge>
    );
}
