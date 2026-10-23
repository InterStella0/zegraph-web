'use client'
import {createContext, ReactNode, use, useContext} from "react";
import {Server} from "types/community";
import {ServerSlugPromise} from "./util.ts";

type ServerData = {server: Server}
const ServerDataContext = createContext<ServerData | null>({ server: null });

export default function ServerDataProvider({slugPromise, children}: {slugPromise: ServerSlugPromise, children: ReactNode}) {
    return <ServerDataContext.Provider value={{ server: use(slugPromise) }}>
        {children}
    </ServerDataContext.Provider>
}

export const useServerData = (): ServerData => useContext(ServerDataContext);
