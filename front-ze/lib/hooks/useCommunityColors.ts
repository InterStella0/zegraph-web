'use client'
import {useEffect, useMemo, useSyncExternalStore} from 'react'
import {useServerMap} from 'components/ui/ServerProvider'
import {getIconDominantColor, nameHashColor, peekIconColor, subscribeIconColors} from 'utils/communityColor'
import {assignCommunityColors} from 'utils/communityPalette'

export type ColorableCommunity = {key: string, name: string, icon_url?: string | null}

type RankedCommunity = ColorableCommunity & {since: string}

export function useCommunityColors(communities: ColorableCommunity[]): Record<string, string> {
    const allCommunities = useServerMap()?.communities

    const ranked = useMemo(() => (allCommunities ?? [])
        .map((c): RankedCommunity => ({
            key: c.id,
            name: c.name,
            icon_url: c.icon_url ?? null,
            since: c.servers.map(s => s.tracking_since).filter(Boolean).sort()[0] ?? '~',
        }))
        .sort((a, b) => a.since < b.since ? -1 : a.since > b.since ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    [allCommunities])

    const rankedSignature = JSON.stringify(ranked.map(c => [c.key, c.name, c.icon_url]))
    const signature = JSON.stringify(communities.map(c => [c.key, c.name, c.icon_url ?? '']))
    const iconUrls = [...new Set([...ranked, ...communities].map(c => c.icon_url).filter((url): url is string => !!url))]
    const iconSignature = iconUrls.join('\n')

    const iconSnapshot = useSyncExternalStore(
        subscribeIconColors,
        () => iconUrls.map(url => peekIconColor(url) ?? '').join(','),
        () => '',
    )

    useEffect(() => {
        for (const url of iconUrls) void getIconDominantColor(url)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [iconSignature])

    return useMemo(() => {
        const snapshot = iconSnapshot.split(',')
        const iconColors = new Map<string, string>()
        iconUrls.forEach((url, i) => {
            if (snapshot[i]) iconColors.set(url, snapshot[i])
        })
        const preferred = (c: ColorableCommunity) => (c.icon_url && iconColors.get(c.icon_url)) || nameHashColor(c.name)

        const palette = assignCommunityColors(ranked.map(preferred))
        const assigned = new Map(ranked.map((c, i) => [c.key, palette[i]]))
        const extras = communities.filter(c => !assigned.has(c.key))
        const extraColors = assignCommunityColors(extras.map(preferred), palette)
        extras.forEach((c, i) => assigned.set(c.key, extraColors[i]))

        const colors: Record<string, string> = {}
        for (const community of communities) {
            colors[community.key] = assigned.get(community.key)
        }
        return colors
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rankedSignature, signature, iconSnapshot])
}
