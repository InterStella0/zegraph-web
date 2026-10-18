'use client'
import {useEffect, useMemo, useState} from 'react'
import {getCommunityColor, nameHashColor} from 'utils/communityColor'

export type ColorableCommunity = {key: string, name: string, icon_url?: string | null}

export function useCommunityColors(communities: ColorableCommunity[]): Record<string, string> {
    const [resolved, setResolved] = useState<Record<string, string>>({})

    const signature = JSON.stringify(communities.map(c => [c.key, c.name, c.icon_url ?? '']))

    useEffect(() => {
        let cancelled = false
        for (const community of communities) {
            const {promise} = getCommunityColor(community.icon_url, community.name)
            promise?.then(color => {
                if (cancelled) return
                setResolved(prev => prev[community.key] === color ? prev : {...prev, [community.key]: color})
            })
        }
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature])

    return useMemo(() => {
        const colors: Record<string, string> = {}
        for (const community of communities) {
            colors[community.key] = resolved[community.key] ?? nameHashColor(community.name)
        }
        return colors
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, resolved])
}
