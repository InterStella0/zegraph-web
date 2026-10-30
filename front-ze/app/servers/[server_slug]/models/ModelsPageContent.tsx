'use client'
import { ReactNode, Suspense, use } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { range } from "utils/generalUtils"
import { Character3DModel } from "types/maps"
import { Card, CardContent } from "components/ui/card"
import { Badge } from "components/ui/badge"
import { Button } from "components/ui/button"
import { Skeleton, SkeletonText } from "components/ui/skeleton"

const GRID = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function ModelCard({ image, title, badges, details, href }: {
    image: ReactNode, title: string, badges: ReactNode, details: ReactNode, href: string,
}) {
    return (
        <Card className="overflow-hidden flex flex-col">
            <div className="relative h-32 bg-muted shrink-0">
                {image ?? <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">No Image</div>}
            </div>
            <CardContent className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm break-all">{title}</span>
                    {badges}
                </div>
                <div className="text-xs text-muted-foreground space-y-1">{details}</div>
                <Button asChild size="sm" variant="outline" className="mt-auto w-full">
                    <Link href={href}>
                        View
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}

function CharacterModelCard({ model, serverSlug }: { model: Character3DModel, serverSlug: string }) {
    const name = model.name ?? model.model_id
    return (
        <ModelCard
            image={model.thumbnail_path ? <img src={model.thumbnail_path} alt={name} className="w-full h-full object-cover" /> : null}
            title={name}
            badges={<Badge variant="secondary" className="shrink-0">Character</Badge>}
            details={<>
                <div>{formatBytes(model.file_size)}</div>
                {model.credit && <div>Credit: {model.credit}</div>}
                {model.uploader_name && <div>Uploaded by: {model.uploader_name}</div>}
            </>}
            href={`/servers/${serverSlug}/characters/${model.model_id}`}
        />
    )
}

function ModelCardSkeleton({ lines }: { lines: number }) {
    return (
        <Card className="overflow-hidden flex flex-col">
            <Skeleton className="h-32 rounded-none shrink-0" />
            <CardContent className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div className="text-sm"><SkeletonText className="h-4 w-32" /></div>
                    <Skeleton className="h-[22px] w-16 shrink-0" />
                </div>
                <div className="text-xs space-y-1">
                    {range(lines).map(i => <div key={i}><SkeletonText className="h-3 w-28" /></div>)}
                </div>
                <Skeleton className="mt-auto h-8 w-full" />
            </CardContent>
        </Card>
    )
}

function ModelGrid<T>({ promise, empty, render }: { promise: Promise<T[]>, empty: string, render: (item: T) => ReactNode }) {
    const items = use(promise)
    if (items.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>
    return <div className={GRID}>{items.map(render)}</div>
}

function ModelSection<T>({ title, lines, ...grid }: {
    title: string, lines: number, promise: Promise<T[]>, empty: string, render: (item: T) => ReactNode,
}) {
    return (
        <section className="space-y-4">
            <h2 className="text-xl font-semibold">{title}</h2>
            <Suspense fallback={<div className={GRID}>{range(8).map(i => <ModelCardSkeleton key={i} lines={lines} />)}</div>}>
                <ModelGrid {...grid} />
            </Suspense>
        </section>
    )
}

export default function ModelsPageContent({ charactersPromise }: {
    charactersPromise: Promise<Character3DModel[]>,
}) {
    const serverSlug = useParams().server_slug as string

    return (
        <div className="container max-w-screen-xl py-6 mx-auto px-2 space-y-10">
            <h1 className="text-3xl font-bold">3D Models</h1>
            <ModelSection
                title="Character Models"
                lines={3}
                promise={charactersPromise}
                empty="No character models available."
                render={model => <CharacterModelCard key={model.id} model={model} serverSlug={serverSlug} />}
            />
        </div>
    )
}
