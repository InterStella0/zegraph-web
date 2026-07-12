import { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getServerSlugOrNotFound } from "../../util"
import { formatTitle, fetchServerUrl } from "utils/generalUtils"
import { Character3DModel } from "types/maps"
import { Badge } from "components/ui/badge"
import { Button } from "components/ui/button"
import { ArrowLeft } from "lucide-react"
import CharacterViewerRenderer from "./CharacterViewerRenderer"
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string, character_model_id: string }>
}): Promise<Metadata> {
    const { server_slug, character_model_id } = await params
    const server = await getServerSlugOrNotFound(server_slug)
    const t = await getTranslations('metadata');
    return {
        title: formatTitle(t('characterTitle', {id: character_model_id})),
        description: t('characterDescription', {id: character_model_id, name: server.community_name}),
        alternates: { canonical: `/servers/${server.gotoLink}/characters/${character_model_id}` },
    }
}

export default async function Page({ params }: {
    params: Promise<{ server_slug: string, character_model_id: string }>
}) {
    const { server_slug, character_model_id } = await params
    const server = await getServerSlugOrNotFound(server_slug)

    let model: Character3DModel | null = null
    try {
        model = await fetchServerUrl(server.id, `/characters/${character_model_id}/3d`)
    } catch {
        notFound()
    }

    const displayName = model.name ?? model.model_id

    return (
        <div className="container max-w-screen-2xl mx-auto px-4 py-6">
            <div className="mb-6">
                <div className="flex items-center gap-4 mb-4">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href={`/servers/${server.gotoLink}/models`}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Models
                        </Link>
                    </Button>
                </div>
                <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-3xl font-bold">{displayName}</h1>
                    <Badge variant="secondary">Character</Badge>
                </div>
                {(model.credit || model.uploader_name) && (
                    <div className="text-sm text-muted-foreground space-x-3">
                        {model.credit && <span>Credit: {model.credit}</span>}
                        {model.uploader_name && <span>Uploaded by: {model.uploader_name}</span>}
                    </div>
                )}
                <p className="text-muted-foreground text-sm mt-1">
                    Interactive 3D model viewer with FPS controls - Press F for fullscreen
                </p>
            </div>

            <div className="h-[calc(100vh-16rem)] border rounded-lg overflow-hidden bg-background flex items-center justify-center">
                <CharacterViewerRenderer model={model} />
            </div>
        </div>
    )
}
