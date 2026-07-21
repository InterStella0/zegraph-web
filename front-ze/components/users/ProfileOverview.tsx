'use client';

import { Card, CardContent } from "components/ui/card";
import ProfileHeatmap from "./ProfileHeatmap";

export default function ProfileOverview({ userId }: { userId: string }) {
    return (
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
            <CardContent className="p-6">
                <ProfileHeatmap userId={userId} />
            </CardContent>
        </Card>
    );
}
