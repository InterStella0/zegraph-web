'use client'
import {ReactNode, useEffect, useState} from "react";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "components/ui/card";
import {AdSpot} from "components/ui/AdSpot";
import {ScreenReaderOnly} from "components/ui/ScreenReaderOnly";

export function SessionLayout({ header, main, side }: { header: ReactNode, main: ReactNode, side: ReactNode }) {
    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
            {header}

            <AdSpot className="my-4" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                    {main}
                </div>

                <div className="lg:col-span-5 xl:col-span-4">
                    {side}
                </div>
            </div>
        </div>
    );
}

/** A 300px session chart; with a `summary`, the chart is exposed to screen readers as an image described by it. */
export function SessionChartCard({ title, description, summaryId, summary, children }: {
    title: string, description: ReactNode, summaryId?: string, summary?: string, children: ReactNode,
}) {
    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {summary && <ScreenReaderOnly id={summaryId}>{summary}</ScreenReaderOnly>}
                <div
                    className="h-[300px]"
                    role={summary ? "img" : undefined}
                    aria-label={summary ? title : undefined}
                    aria-describedby={summary ? summaryId : undefined}
                >
                    {children}
                </div>
            </CardContent>
        </Card>
    );
}

/** Keeps an ongoing session fresh by re-fetching it every 65s until it ends. */
export function useLiveSession<T extends { sessionInfo: { ended_at: string | null } }>(
    initial: T,
    reload: (session: T) => Promise<T>,
): T {
    const [data, setData] = useState(initial)
    const ongoing = data.sessionInfo.ended_at === null

    useEffect(() => {
        if (!ongoing) return
        const load = () => reload(initial).then(setData)
        load().catch(console.error)
        const interval = setInterval(load, 65_000)
        return () => clearInterval(interval)
    }, [ongoing, initial, reload])

    return data
}
