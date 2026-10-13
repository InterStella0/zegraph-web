import {cookies} from "next/headers";
import {DONOR_BANNER_DISMISSED, DonorBannerData, getAllSupporters, getRecentSupporters} from "utils/supporters";

export default async function getDonorBanner(): Promise<DonorBannerData | null> {
    const [donors, all, cookieStore] = await Promise.all([getRecentSupporters(10), getAllSupporters(), cookies()])
    if (donors.length === 0) return null

    const latestId = donors[0].created_at
    if (cookieStore.get(DONOR_BANNER_DISMISSED)?.value === latestId) return null

    // Already newest first; the same supporter can appear more than once.
    const uniqueNames = [...new Set(donors.map((d) => d.name))]
    const shown = uniqueNames.slice(0, 3)
    const totalSupporters = all ? all.names.length + all.anonymous : 0
    return {
        latestId,
        names: shown.join(', '),
        remaining: Math.max(totalSupporters, uniqueNames.length) - shown.length,
    }
}
