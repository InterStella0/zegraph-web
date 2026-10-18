'use client'
import { ReactNode } from "react";
import { useLocale } from "next-intl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import { cn } from "components/lib/utils";
import { formatNumber } from "utils/generalUtils";

export type SplitSegment = {
    key: string,
    label: ReactNode,
    value: number,
    color?: string,
    className?: string,
}

function formatShare(value: number, locale: string): string {
    return formatNumber(value, value > 0 && value < 10 ? 1 : 0, locale);
}

export default function SplitBar({ segments, formatValue, legend = true, size = "md", ariaLabel, className }: {
    segments: SplitSegment[],
    formatValue: (value: number) => string,
    legend?: boolean,
    size?: "sm" | "md",
    ariaLabel?: string,
    className?: string,
}) {
    const locale = useLocale();
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const share = (value: number) => total > 0 ? value / total * 100 : 0;
    const visible = segments.filter(segment => segment.value > 0);

    return (
        <div className={cn("min-w-0", className)}>
            <TooltipProvider>
                <div
                    className={cn(
                        "w-full overflow-hidden rounded-full bg-muted",
                        size === "sm" ? "h-1.5" : "h-2.5",
                    )}
                    role={ariaLabel ? "img" : undefined}
                    aria-label={ariaLabel}
                >
                    <div className="flex size-full origin-left gap-0.5 motion-safe:animate-bar-grow">
                        {visible.map(segment => (
                            <Tooltip key={segment.key}>
                                <TooltipTrigger asChild>
                                    <div
                                        className={cn("h-full transition-[width] duration-500 ease-out", segment.className)}
                                        style={{ width: `${share(segment.value)}%`, backgroundColor: segment.color }}
                                    />
                                </TooltipTrigger>
                                <TooltipContent>
                                    {segment.label} · {formatValue(segment.value)} ({formatShare(share(segment.value), locale)}%)
                                </TooltipContent>
                            </Tooltip>
                        ))}
                    </div>
                </div>
            </TooltipProvider>
            {legend && (
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                    {segments.map(segment => (
                        <li key={segment.key} className="flex items-center gap-2 text-sm">
                            <span
                                className={cn("size-2 shrink-0 rounded-sm", segment.className)}
                                style={{ backgroundColor: segment.color }}
                                aria-hidden
                            />
                            <span className="text-muted-foreground">{segment.label}</span>
                            <span className="font-semibold tabular-nums">{formatValue(segment.value)}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                                {formatShare(share(segment.value), locale)}%
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
