'use client'
import { Skeleton } from "components/ui/skeleton";
import { cn } from "components/lib/utils";
import { range, simpleRandom } from "utils/generalUtils";
import { useHydrated } from "lib/hooks/useHydrated";

export default function SkeletonBarGraph({
    width = 400,
    height = 300,
    textWidth = 90,
    barHeight = 10,
    amount = 10,
    gap = ".1rem",
    className,
    sorted = false
}: {
    width?: number;
    height?: number;
    textWidth?: number;
    barHeight?: number;
    amount?: number;
    gap?: string;
    sorted?: boolean;
    className?: string;
}) {
    // Random bar widths only after hydration; the server and the first client render use the minimum.
    const hydrated = useHydrated();
    const barWidths = range(amount).map(() => simpleRandom(width * 0.2, width * 0.8, hydrated));
    if (sorted)
        barWidths.sort((a, b) => b - a);

    return (
        <div
            className={cn("w-full flex flex-col m-4", className)}
            style={{ height, gap }}
        >
            {barWidths.map((barWidth, index) => (
                <div className="flex items-center" key={index}>
                    <Skeleton style={{ width: textWidth }} className="h-4" />
                    <Skeleton
                        className="mx-4"
                        style={{ width: barWidth, height: barHeight }}
                    />
                </div>
            ))}
        </div>
    );
}
