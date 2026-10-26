'use client'
import {createContext, ReactNode, use, useContext, useState} from "react";
import CommunitySelectorDisplay from "components/ui/CommunitySelector";
import RequestServerDialog from "components/ui/RequestServerDialog";
import {SteamProfile} from "types/steam";

const SidebarContext = createContext<{ setDisplayCommunity: (value: boolean) => void }>({ setDisplayCommunity: () => {} })

export const useSidebar = () => useContext(SidebarContext)

export default function ServersShell(
    { children, user, initialCollapsed }: { children: ReactNode, user: Promise<SteamProfile | null>, initialCollapsed: boolean | null }
) {
    const resolvedUser = user ? use(user) : null
    const [ displayCommunity, setDisplayCommunity ] = useState(false);
    const [ requestOpen, setRequestOpen ] = useState(false);
    return <div className="flex">
        <CommunitySelectorDisplay displayCommunity={displayCommunity} setDisplayCommunity={setDisplayCommunity} setRequestOpen={setRequestOpen} initialCollapsed={initialCollapsed} />
        <RequestServerDialog user={resolvedUser} open={requestOpen} onClose={() => setRequestOpen(false)} />
        <SidebarContext.Provider value={{ setDisplayCommunity }}>
            {children}
        </SidebarContext.Provider>
    </div>
}
