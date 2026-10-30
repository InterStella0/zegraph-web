import { Metadata } from "next"
import { getServerSlugOrNotFound } from "../util.ts"
import { serverMetadata } from "../serverMetadata"
import { fetchServerUrl } from "utils/generalUtils.ts"
import { Character3DModel } from "types/maps"
import ModelsPageContent from "./ModelsPageContent"

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string }>
}): Promise<Metadata> {
    return serverMetadata(params, (server, t) => ({
        title: t('modelsTitle', {name: server.community_name}),
        description: t('modelsDescription', {name: server.community_name}),
        path: '/models',
    }))
}

export default async function Page({ params }: {
    params: Promise<{ server_slug: string }>
}) {
    const { server_slug } = await params
    const server = await getServerSlugOrNotFound(server_slug)
    const charactersPromise: Promise<Character3DModel[]> = fetchServerUrl(server.id, '/characters')
        .then(models => models ?? [])
        .catch(() => [])
    return <ModelsPageContent charactersPromise={charactersPromise} />
}
