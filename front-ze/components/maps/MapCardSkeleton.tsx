import {simpleRandom} from "utils/generalUtils.ts";
import {Skeleton} from "components/ui/skeleton.tsx";
import {useEffect, useState} from "react";

export default function MapCardSkeleton() {
    const [ isClient, setIsClient ] = useState<boolean>(false);
    useEffect(() => {
        setIsClient(true);
    }, [isClient])
    return (
        <div className="flex-none w-[180px] rounded-lg overflow-hidden relative transition-all duration-200 ease-in-out shadow">
            <div className="relative w-full h-[100px]">
                <Skeleton className="w-full h-full rounded-none" />

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                    <Skeleton className="absolute bottom-2 right-2 w-[40px] h-[20px] rounded" />
                </div>
            </div>

            <div className="p-5">
                <Skeleton
                    className={`h-[1.4rem] rounded w-[${simpleRandom(70, 120, isClient)}px]`}
                />
                <Skeleton className="mt-2 mb-1 h-[1.2rem] w-3/5 rounded" />
            </div>
        </div>
    );
}