import { Metadata } from "next"
import { getServerSlugOrNotFound } from "../util.ts"
import { formatTitle } from "utils/generalUtils.ts"
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

export default function Page() {
    return <ModelsPageContent />
}
