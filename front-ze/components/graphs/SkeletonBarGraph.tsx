'use client'
import { Skeleton } from "components/ui/skeleton";
import { cn } from "components/lib/utils";
import { simpleRandom } from "utils/generalUtils";
import { useEffect, useState } from "react";

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
    const [isClient, setIsClient] = useState(false);
    const minFactor = 0.2;
    const maxFactor = 0.8;
    const maxWidth = width * maxFactor;
    const minWidth = width * minFactor;

    useEffect(() => {
        setIsClient(true);
    }, []);

    const randomValues = Array.from(
        { length: amount },
        () => simpleRandom(minWidth, maxWidth, isClient)
    );

    if (sorted)
        randomValues.sort((a, b) => b - a);

    return (
        <div
            className={cn("w-full flex flex-col m-4", className)}
            style={{ height, gap }}
        >
            {randomValues.map((width, index) => (
                <div className="flex items-center" key={index}>
                    <Skeleton style={{ width: textWidth }} className="h-4" />
                    <Skeleton
                        className="mx-4"
                        style={{ width, height: barHeight }}
                    />
                </div>
            ))}
        </div>
    );
}
