'use client';

import { use } from "react";
import { Card, CardContent } from "components/ui/card";
import { PlayerSessionTime } from "types/community";
import ProfileHeatmap from "./ProfileHeatmap";

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
