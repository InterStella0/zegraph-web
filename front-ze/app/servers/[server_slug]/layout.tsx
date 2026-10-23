import getServerUser from "../../getServerUser";
import getBasicAnnouncements from "../../getBasicAnnouncements";
import ServerDataProvider from "./ServerDataProvider";
import {ReactNode, Suspense} from "react";
import 'leaflet/dist/leaflet.css';
import ResponsiveAppSelector from "./ResponsiveAppSelector";
import Loading from "./loading.tsx";
import {getServerSlugOrNotFound} from "./util.ts";

export default async function ServerLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ server_slug: string }>;
}) {
    const { server_slug } = await params
    const serverPromise = Promise.resolve(await getServerSlugOrNotFound(server_slug))

    return <ServerDataProvider slugPromise={serverPromise}>
        <ResponsiveAppSelector serverPromise={serverPromise} user={getServerUser()} announcementsPromise={getBasicAnnouncements()}>
            <Suspense fallback={<Loading />}>
                {children}
            </Suspense>
        </ResponsiveAppSelector>
    </ServerDataProvider>
}
