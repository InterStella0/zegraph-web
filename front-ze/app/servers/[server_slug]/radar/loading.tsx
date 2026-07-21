import { Skeleton } from "components/ui/skeleton";

export default function Loading() {
    return (
        <div className="w-full">
            <div className="m-4">
                <Skeleton className="rounded-lg w-full h-full" />
            </div>
        </div>
    );
}
