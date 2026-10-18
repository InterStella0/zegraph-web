'use client'
import {useMemo} from 'react'
import {color} from 'chart.js/helpers'
import {useServerMap} from 'components/ui/ServerProvider'
import {useCommunityColors} from 'lib/hooks/useCommunityColors'

export function useServerColors(serverIds: string[]): Record<string, string> {
    const {serversMapped} = useServerMap()
    const servers = serverIds.map(id => ({id, server: serversMapped.get(id)}))

    const communities = new Map<string, {key: string, name: string, icon_url: string | null}>()
    for (const {id, server} of servers) {
        const key = server?.community_id ?? id
        if (!communities.has(key))
            communities.set(key, {key, name: server?.community_name ?? id, icon_url: server?.community_icon ?? null})
    }
    const communityColors = useCommunityColors([...communities.values()])

    const signature = JSON.stringify(servers.map(({id, server}) => [id, server?.community_id ?? id]))
    return useMemo(() => {
        const seen = new Map<string, number>()
        const colors: Record<string, string> = {}
        for (const {id, server} of servers) {
            const key = server?.community_id ?? id
            const index = seen.get(key) ?? 0
            seen.set(key, index + 1)
            const base = communityColors[key]
            if (index === 0) {
                colors[id] = base
                continue
            }
            const step = Math.ceil(index / 2)
            const shade = index % 2 === 1 ? color(base).lighten(0.25 * step) : color(base).darken(0.25 * step)
            colors[id] = shade.hexString()
        }
        return colors
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, communityColors])
}
