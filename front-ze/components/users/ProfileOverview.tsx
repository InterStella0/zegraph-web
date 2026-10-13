'use client';

import { use } from "react";
import { Card, CardContent } from "components/ui/card";
import { Skeleton } from "components/ui/skeleton";
import { PlayerSessionTime } from "types/community";
import ProfileHeatmap from "./ProfileHeatmap";

export function ProfileOverviewLoading() {
    return (
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
            <CardContent className="p-6">
                <div className="flex items-baseline justify-between gap-2 mb-4">
                    <Skeleton className="h-7 w-72" />
                    <Skeleton className="h-8 w-25" />
                </div>
                <Skeleton className="h-[150px] w-full" />
            </CardContent>
        </Card>
    );
}

export default function ProfileOverview({ heatmapPromise }: { heatmapPromise: Promise<PlayerSessionTime[]> }) {
    const rawData = use(heatmapPromise);
    return (
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
            <CardContent className="p-6">
                <ProfileHeatmap rawData={rawData} />
            </CardContent>
        </Card>
    );
}
