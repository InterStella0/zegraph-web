import { Metadata } from "next"
import { getServerSlugOrNotFound } from "../../util"
import { serverMetadata } from "../../serverMetadata"
import { fetchServerUrl, orNotFound } from "utils/generalUtils"
import { Character3DModel } from "types/maps"
import { Badge } from "components/ui/badge"
import { ViewerPage } from "app/(site)/maps/[map_name]/3d/ViewerShell"
import CharacterViewerRenderer from "./CharacterViewerRenderer"

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string, character_model_id: string }>
}): Promise<Metadata> {
    return serverMetadata(params, (server, t, { character_model_id }) => ({
        title: t('characterTitle', {id: character_model_id}),
        description: t('characterDescription', {id: character_model_id, name: server.community_name}),
        path: `/characters/${character_model_id}`,
    }))
}

export default async function Page({ params }: {
    params: Promise<{ server_slug: string, character_model_id: string }>
}) {
    const { server_slug, character_model_id } = await params
    const server = await getServerSlugOrNotFound(server_slug)
    const model: Character3DModel = await orNotFound(fetchServerUrl(server.id, `/characters/${character_model_id}/3d`))

    return (
        <ViewerPage
            backHref={`/servers/${server.gotoLink}/models`}
            backLabel="Back to Models"
            viewer={<CharacterViewerRenderer model={model} />}
        >
            <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold">{model.name ?? model.model_id}</h1>
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
        </ViewerPage>
    )
}
