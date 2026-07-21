import {ReactNode} from "react";
import {cookies} from "next/headers";
import getServerUser from "../getServerUser";
import ServersShell from "./ServersShell";
import {COMMUNITY_COLLAPSE} from "components/ui/communityCollapse";

export default async function ServersLayout({ children }: { children: ReactNode }) {
    const user = getServerUser();
    const savedCollapse = (await cookies()).get(COMMUNITY_COLLAPSE)?.value
    const initialCollapsed = savedCollapse === undefined ? null : savedCollapse === "true"
    return <ServersShell user={user} initialCollapsed={initialCollapsed}>{children}</ServersShell>
}
