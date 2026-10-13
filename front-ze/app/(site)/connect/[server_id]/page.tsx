import {getServerSlug} from "app/servers/[server_slug]/util.ts";
import {notFound} from "next/navigation";
import Link from "next/link";

export default async function ConnectPage({ params }:  { params: Promise<{ server_id: string }>}){
    const { server_id } = await params
    const server = await getServerSlug(server_id)
    if (!server)
        notFound()

    const connect = `steam://connect/${server.fullIp}`

    return (
        <div className="flex items-center justify-center h-[calc(100vh-(160px+64px))]">
            <div className="text-center space-y-4 p-8">
                <h1 className="text-2xl font-bold">Connecting to {server.name}</h1>
                <p className="text-muted-foreground">{server.fullIp}</p>
                <p className="text-sm text-muted-foreground">Launching Steam...</p>
                <Link
                    href={connect}
                    className="inline-block mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                    Click here if not redirected
                </Link>
                <script dangerouslySetInnerHTML={{
                    __html: `window.location.href = "${connect}";`
                }} />
            </div>
        </div>
    )
}