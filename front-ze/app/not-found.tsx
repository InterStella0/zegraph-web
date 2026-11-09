import ResponsiveAppBar from "components/ui/ResponsiveAppBar.tsx";
import {StatusPage} from "components/common/StatusPage";
import getServerUser from "./getServerUser.ts";
import getDiscordMembers from "./getDiscordMembers.ts";

export default function NotFound() {
    const user = getServerUser();
    return <>
        <ResponsiveAppBar userPromise={user} discordMembersPromise={getDiscordMembers()} server={null} setDisplayCommunity={null} />
        <StatusPage code="404" title="Page Not Found">There is not such page!</StatusPage>
    </>
}
