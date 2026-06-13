import { Skeleton } from "components/ui/skeleton";

export default function Loading() {
    return (
        <div className="w-full">
            <div className="p-6">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-bold mb-2">Players</h1>
                    <p className="text-lg text-gray-500">
                        Discover the tryhards and casuals (gigachads) in the community
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton
                            key={index}
                            className="rounded-lg w-full h-[190px]"
                        />
                    ))}
                </div>

                {/* Main grid */}
                <div className="grid grid-cols-12 gap-6">
                    <div className="col-span-12 lg:col-span-8 space-y-6">
                        <Skeleton className="rounded-lg w-full h-[707px]" />
                        <Skeleton className="rounded-lg w-full h-[1450px]" />
                    </div>

                    <div className="col-span-12 lg:col-span-4 space-y-6">
                        <Skeleton className="rounded-lg w-full h-[1297px]" />
                        <Skeleton className="rounded-lg w-full h-[539px]" />
                    </div>
                </div>
            </div>
        </div>
    );
}
