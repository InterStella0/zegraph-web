import { Skeleton } from "components/ui/skeleton";
import { AdSpot } from "components/ui/AdSpot";

export default function Loading() {
    return (
        <div className="p-4">
            <AdSpot className="mb-4" />
            <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12">
                    <Skeleton className="w-full h-[71px] sm:h-[50px] md:h-[56px] rounded-lg" />
                </div>
                <div className="col-span-12 xl:col-span-8">
                    <Skeleton className="w-full h-[900px] sm:h-[616px] md:h-[669px] lg:h-[623px] rounded-lg" />
                </div>
                <div className="col-span-12 md:col-span-6 xl:col-span-4">
                    <Skeleton className="w-full h-[648px] sm:h-[609px] md:h-[665px] min-[114rem]:h-[623px] rounded-lg" />
                </div>
                <div className="col-span-12 md:col-span-6 xl:col-span-8">
                    <Skeleton className="w-full h-[370px] sm:h-[470px] rounded-lg" />
                </div>
                <div className="col-span-12 md:col-span-6 xl:col-span-4">
                    <Skeleton className="w-full h-[500px] rounded-lg" />
                </div>
                <div className="col-span-12 md:col-span-6 xl:col-span-4">
                    <Skeleton className="w-full h-[477px] rounded-lg" />
                </div>
                <div className="col-span-12 xl:col-span-8">
                    <Skeleton className="w-full h-[532px] sm:h-[479px] md:h-[538px] lg:h-[496px] rounded-lg" />
                </div>
            </div>
        </div>
    );
}
