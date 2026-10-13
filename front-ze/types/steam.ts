import type { SteamProfile as BaseSteamProfile } from 'next-auth-steam/lib/steam'

export type SteamProfile = BaseSteamProfile & {
    is_superuser?: boolean
    is_map_manager?: boolean
    is_banned?: boolean
    ban_reason?: string | null
}
