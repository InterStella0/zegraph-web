'use client'
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useServerData } from "../ServerDataProvider"
import { fetchServerUrl, getMapImage } from "utils/generalUtils.ts"
import { MapWithModels, Character3DModel } from "types/maps"
import { Card, CardContent } from "components/ui/card"
import { Badge } from "components/ui/badge"
import { Button } from "components/ui/button"
import { Skeleton } from "components/ui/skeleton"

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function CharacterModelCard({ model, serverSlug }: { model: Character3DModel, serverSlug: string }) {
    return (
        <Card className="overflow-hidden flex flex-col">
            <div className="relative h-32 bg-muted shrink-0">
                {model.thumbnail_path ? (
                    <img
                        src={model.thumbnail_path.startsWith('http') ? model.thumbnail_path : `/data/api/thumbnails/characters/${model.thumbnail_path}`}
                        alt={model.name ?? model.model_id}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">No Image</div>
                )}
            </div>
            <CardContent className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm break-all">{model.name ?? model.model_id}</span>
                    <Badge variant="secondary" className="shrink-0">Character</Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                    <div>{formatBytes(model.file_size)}</div>
                    {model.credit && <div>Credit: {model.credit}</div>}
                    {model.uploader_name && <div>Uploaded by: {model.uploader_name}</div>}
                </div>
                <Button asChild size="sm" variant="outline" className="mt-auto w-full">
                    <Link href={`/servers/${serverSlug}/characters/${model.model_id}`}>
                        View
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}

function MapModelCard({ mapModel, serverId }: { mapModel: MapWithModels, serverId: string }) {
    const { low_res_model, high_res_model } = mapModel
    const [mapImage, setMapImage] = useState<string | null>(null)
    const [imageLoading, setImageLoading] = useState(true)

    useEffect(() => {
        setImageLoading(true)
        getMapImage(serverId, mapModel.map_name)
            .then(e => setMapImage(e ? e.small : null))
            .finally(() => setImageLoading(false))
    }, [serverId, mapModel.map_name])

    return (
        <Card className="overflow-hidden flex flex-col">
            <div className="relative h-32 bg-muted shrink-0">
                {imageLoading ? (
                    <Skeleton className="h-full w-full rounded-none" />
                ) : mapImage ? (
                    <img src={mapImage} alt={mapModel.map_name} className="w-full h-full object-cover" />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">No Image</div>
                )}
            </div>
            <CardContent className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm break-all">{mapModel.map_name}</span>
                    <div className="flex gap-1 shrink-0">
                        {low_res_model && <Badge variant="outline">Low</Badge>}
                        {high_res_model && <Badge>High</Badge>}
                    </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                    {low_res_model && <div>Low res — {formatBytes(low_res_model.file_size)}</div>}
                    {high_res_model && <div>High res — {formatBytes(high_res_model.file_size)}</div>}
                </div>
                <Button asChild size="sm" variant="outline" className="mt-auto w-full">
                    <Link href={`/maps/${mapModel.map_name}/3d`}>
                        View
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}

function GridSkeleton() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
        </div>
    )
}

export default function ModelsPageContent() {
    const { server } = useServerData()
    const params = useParams()
    const serverSlug = params.server_slug as string
    const [characterModels, setCharacterModels] = useState<Character3DModel[]>([])
    const [mapModels, setMapModels] = useState<MapWithModels[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!server) return
        Promise.all([
            fetchServerUrl(server.id, '/characters'),
            fetchServerUrl(server.id, '/maps/3d'),
        ]).then(([chars, maps]) => {
            setCharacterModels(chars ?? [])
            setMapModels(
                (maps ?? []).filter(
                    (m: MapWithModels) => m.low_res_model || m.high_res_model
                )
            )
        }).catch(() => {}).finally(() => setLoading(false))
    }, [server?.id])

    return (
        <div className="container max-w-screen-xl py-6 mx-auto px-2 space-y-10">
            <h1 className="text-3xl font-bold">3D Models</h1>

            <section className="space-y-4">
                <h2 className="text-xl font-semibold">Character Models</h2>
                {loading ? (
                    <GridSkeleton />
                ) : characterModels.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No character models available.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {characterModels.map(model => (
                            <CharacterModelCard key={model.id} model={model} serverSlug={serverSlug} />
                        ))}
                    </div>
                )}
            </section>

            <section className="space-y-4">
                <h2 className="text-xl font-semibold">Map Models</h2>
                {loading ? (
                    <GridSkeleton />
                ) : mapModels.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No map models available for this server.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {mapModels.map(m => (
                            <MapModelCard key={m.map_name} mapModel={m} serverId={server.id} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
