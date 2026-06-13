import ErrorCatch from "./ErrorMessage.tsx";
import WebAppBar from "./WebAppBar";
import {Dispatch} from "react";
import {Server} from "types/community";
import {SteamProfile} from "../../next-auth-steam/steam.ts";


export default function ResponsiveAppBar(
    { userPromise, server, setDisplayCommunity }
    : { server: Server | null, userPromise: Promise<SteamProfile> | null, setDisplayCommunity: Dispatch<boolean> }
){
    return <ErrorCatch message="App bar is broken.">
        <WebAppBar userPromise={userPromise} server={server} setDisplayCommunity={setDisplayCommunity} />
    </ErrorCatch>
}
