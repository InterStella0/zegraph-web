import { Skeleton } from "components/ui/skeleton";
import { AdSpot } from "components/ui/AdSpot";

const BLOCKS = [
    ["col-span-12", "h-[71px] sm:h-[50px] md:h-[56px]"],
    ["col-span-12 xl:col-span-8", "h-[900px] sm:h-[616px] md:h-[669px] lg:h-[623px]"],
    ["col-span-12 md:col-span-6 xl:col-span-4", "h-[648px] sm:h-[609px] md:h-[665px] min-[114rem]:h-[623px]"],
    ["col-span-12 md:col-span-6 xl:col-span-8", "h-[370px] sm:h-[470px]"],
    ["col-span-12 md:col-span-6 xl:col-span-4", "h-[500px]"],
    ["col-span-12 md:col-span-6 xl:col-span-4", "h-[477px]"],
    ["col-span-12 xl:col-span-8", "h-[532px] sm:h-[479px] md:h-[538px] lg:h-[496px]"],
];

export default function Loading() {
    return (
        <div className="p-4">
            <AdSpot className="mb-4" />
            <div className="grid grid-cols-12 gap-4">
                {BLOCKS.map(([span, height]) => (
                    <div key={height} className={span}>
                        <Skeleton className={`w-full ${height} rounded-lg`} />
                    </div>
                ))}
            </div>
        </div>
    );
}
