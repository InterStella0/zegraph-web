import getServerUser from "../../getServerUser";
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
    const server = await getServerSlugOrNotFound(server_slug)
    const serverPromise = Promise.resolve(server)
    const user = getServerUser();

    return <>
        <ServerDataProvider slugPromise={serverPromise}>
            <div className="flex">
                <ResponsiveAppSelector serverPromise={serverPromise} user={user}>
                    <Suspense fallback={<Loading />}>
                        {children}
                    </Suspense>
                </ResponsiveAppSelector>
            </div>
        </ServerDataProvider>
    </>
}
