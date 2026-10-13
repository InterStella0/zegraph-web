import { Metadata } from "next"
import { getServerSlugOrNotFound } from "../util.ts"
import { fetchServerUrl, formatTitle } from "utils/generalUtils.ts"
import { Character3DModel } from "types/maps"
import ModelsPageContent from "./ModelsPageContent"
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string }>
}): Promise<Metadata> {
    const { server_slug } = await params
    const server = await getServerSlugOrNotFound(server_slug)
    const t = await getTranslations('metadata');
    return {
        title: formatTitle(t('modelsTitle', {name: server.community_name})),
        description: t('modelsDescription', {name: server.community_name}),
        alternates: { canonical: `/servers/${server.gotoLink}/models` }
    }
}

export default async function Page({ params }: {
    params: Promise<{ server_slug: string }>
}) {
    const { server_slug } = await params
    const server = await getServerSlugOrNotFound(server_slug)
    const characterModels: Character3DModel[] | null = await fetchServerUrl(server.id, '/characters').catch(() => null)
    return <ModelsPageContent characterModels={characterModels ?? []} />
}
