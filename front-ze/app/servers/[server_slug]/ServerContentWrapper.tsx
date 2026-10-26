import { use } from 'react'
import { useTranslations } from 'next-intl'
import { notFound } from 'next/navigation'
import ErrorCatch from "components/ui/ErrorMessage.tsx";
import {DateProvider} from "components/graphs/DateStateManager.tsx";
import ServerContent from "./ServerContent.tsx";
import {createServerDescription} from "./page.tsx";
import {Server} from "types/community.ts";
import {fetchServerUrl, orNull} from "utils/generalUtils.ts";

export function ServerContentWrapper({ serverPromise }: { serverPromise: Promise<Server> }) {
    const t = useTranslations('servers.content')
    const server = use(serverPromise)

    if (!server) throw notFound()

    const mapSessionsPromise = orNull(fetchServerUrl(server.id, '/maps/all/sessions', { params: { page: 0 } }))
    const description = use(createServerDescription(server))

    return <ErrorCatch message={t('pageBroken')}>
        <DateProvider>
            <ServerContent server={server} description={description} mapSessionsPromise={mapSessionsPromise} />
        </DateProvider>
    </ErrorCatch>
}
