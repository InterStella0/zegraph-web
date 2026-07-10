import {auth} from "../auth.ts";
import {SteamProfile} from "../next-auth-steam/steam.ts";



export default async function getServerUser(): Promise<SteamProfile | null> {
    const session = await auth()
    return session?.user?.steam
}