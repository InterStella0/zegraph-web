'use client'
import {useMemo} from 'react'
import {color} from 'chart.js/helpers'
import {useServerMap} from 'components/ui/ServerProvider'
import {useCommunityColors} from 'lib/hooks/useCommunityColors'

export function useServerColors(serverIds: string[]): Record<string, string> {
    const {serversMapped} = useServerMap()
    const servers = serverIds.map(id => {
        const server = serversMapped.get(id)
        return {id, server, key: server?.community_id ?? id}
    })

    const communities = new Map<string, {key: string, name: string, icon_url: string | null}>()
    for (const {id, server, key} of servers) {
        if (!communities.has(key))
            communities.set(key, {key, name: server?.community_name ?? id, icon_url: server?.community_icon ?? null})
    }
    const communityColors = useCommunityColors([...communities.values()])

    const signature = JSON.stringify(servers.map(({id, key}) => [id, key]))
    return useMemo(() => {
        const seen = new Map<string, number>()
        const colors: Record<string, string> = {}
        for (const {id, key} of servers) {
            const index = seen.get(key) ?? 0
            seen.set(key, index + 1)
            const base = communityColors[key]
            if (index === 0) {
                colors[id] = base
                continue
            }
            // Further servers of a community alternate lighter and darker shades of its colour.
            const step = 0.25 * Math.ceil(index / 2)
            colors[id] = (index % 2 === 1 ? color(base).lighten(step) : color(base).darken(step)).hexString()
        }
        return colors
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, communityColors])
}
