'use client'
import {createContext, ReactNode, use, useContext} from "react";
import {Server} from "types/community";
import {ServerSlugPromise} from "./util.ts";

type ServerData = {server: Server}
export const ServerDataContext = createContext<ServerData | null>({ server: null });
export default function ServerDataProvider({slugPromise, children}: {slugPromise: ServerSlugPromise, children: ReactNode}) {
    const server = use(slugPromise)
    return <ServerDataContext.Provider value={{ server }}>
        {children}
    </ServerDataContext.Provider>
}

export function useServerData(): ServerData {
    return useContext(ServerDataContext);
}