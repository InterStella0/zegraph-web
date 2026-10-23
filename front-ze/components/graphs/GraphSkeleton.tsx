import { Skeleton } from "components/ui/skeleton";
import { cn } from "components/lib/utils";
import { range } from "utils/generalUtils";

export default function GraphSkeleton({
    height = 200,
    className
}: {
    height?: number;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "w-[95%] flex flex-col items-center justify-end gap-2 px-4",
                className
            )}
            style={{ height }}
        >
            <Skeleton className="w-[10%] h-[15px] my-2" />
            <div className="flex items-end gap-2 justify-evenly w-[90%]">
                {range(50).map(index => (
                    <Skeleton key={index} className="w-2" style={{ height: 2 + (index * 37) % 78 }} />
                ))}
            </div>
            <Skeleton className="w-[95%] h-[15px] my-2" />
        </div>
    );
}
