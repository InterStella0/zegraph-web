import { Skeleton } from "components/ui/skeleton";

export default function Loading() {
    return (
        <div className="w-full">
            <div className="m-4">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                    <div className="xl:col-span-8 col-span-12">
                        <Skeleton className="w-full h-[526px] rounded-lg" />
                    </div>
                    <div className="xl:col-span-4 col-span-12">
                        <Skeleton className="w-full h-[568px] rounded-lg" />
                    </div>
                    <div className="xl:col-span-8 col-span-12">
                        <Skeleton className="w-full h-[452px] rounded-lg" />
                    </div>
                    <div className="xl:col-span-4 lg:col-span-4 col-span-12">
                        <Skeleton className="w-full h-[440px] rounded-lg" />
                    </div>
                    <div className="xl:col-span-4 lg:col-span-8 col-span-12">
                        <Skeleton className="w-full h-[460px] rounded-lg" />
                    </div>
                    <div className="xl:col-span-8 col-span-12">
                        <Skeleton className="w-full h-[375px] rounded-lg" />
                    </div>
                </div>
            </div>
        </div>
    );
}
