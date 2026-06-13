import { Skeleton } from "components/ui/skeleton";

export default function Loading(){
    return (
        <div className="w-full">
            <div className="grid grid-cols-12 gap-6">

                <div className="col-span-12 md:col-span-12 lg:col-span-7 xl:col-span-8 p-8">
                    <Skeleton className="rounded-lg h-[400px]" />
                </div>

                <div className="col-span-12 md:col-span-12 lg:col-span-5 xl:col-span-4 p-8">
                    <Skeleton className="rounded-lg h-[400px] w-full" />
                </div>

                <div className="col-span-12 p-8">
                    <Skeleton className="rounded-lg h-[518px]" />
                </div>

                <div className="col-span-12 md:col-span-6 lg:col-span-7 xl:col-span-4 p-2">
                    <Skeleton className="rounded-lg h-[835px]" />
                </div>

                <div className="col-span-12 md:col-span-6 lg:col-span-5 xl:col-span-4 p-2">
                    <Skeleton className="rounded-lg h-[827px]" />
                </div>

                <div className="col-span-12 xl:col-span-4 grid grid-cols-12 gap-6">
                    <div className="col-span-12 lg:col-span-6 p-0">
                        <Skeleton className="rounded-lg h-[431px]" />
                    </div>
                    <div className="col-span-12 lg:col-span-6 p-0">
                        <Skeleton className="rounded-lg h-[412px]" />
                    </div>
                </div>

            </div>
        </div>
    );

}