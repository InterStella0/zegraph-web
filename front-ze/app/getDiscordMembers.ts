import {fetchUrl} from "utils/generalUtils";

export default function getDiscordMembers(): Promise<number | null> {
    return fetchUrl("/discord/members", { next: { revalidate: 300 } }, true, 0, 0, 1)
        .then((data: { member_count: number }) => data.member_count)
        .catch(() => null)
}
