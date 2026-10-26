import {cookies} from "next/headers";
import dayjs from "lib/dayjs";
import {fetchUrl} from "utils/generalUtils";
import type {Announcement} from "types/announcements";
import {ANNOUNCEMENT_DISMISSED} from "components/announcements/announcementDismissal";

export default async function getBasicAnnouncements(): Promise<Announcement[]> {
    const [data, cookieStore] = await Promise.all([
        fetchUrl("/announcements", { next: { revalidate: 60 } }).catch((): Announcement[] => []),
        cookies(),
    ])
    const storedAt = cookieStore.get(ANNOUNCEMENT_DISMISSED)?.value
    const dismissedAt = storedAt ? dayjs(storedAt) : null
    return (data as Announcement[])
        .filter(a => a.type === 'Basic')
        .sort((a, b) => dayjs(b.created_at).diff(dayjs(a.created_at)))
        .filter(a => !dismissedAt || dayjs(a.created_at).isAfter(dismissedAt))
}
