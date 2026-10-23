import {auth} from "../auth.ts";
import {SteamProfile} from "types/steam";

export default async function getServerUser(): Promise<SteamProfile | null> {
    const session = await auth()
    return session?.user?.steam
}
