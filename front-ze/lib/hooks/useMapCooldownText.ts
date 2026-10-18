'use client'
import {useSyncExternalStore} from 'react'
import {useTranslations} from 'next-intl'
import {useLocalDayjs} from 'lib/hooks/useHydrated'
import {localNomWindow, MapBlockers} from 'utils/mapCooldown'

// mapBlockers() and fromNow() read the clock when they render, so a page left open would keep showing
// a cooldown that has ended. One shared timer re-renders every user of this hook once a minute.
let minute = 0
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribeMinute(listener: () => void) {
    listeners.add(listener)
    timer ??= setInterval(() => {
        minute++
        listeners.forEach(notify => notify())
    }, 60_000)
    return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
            clearInterval(timer)
            timer = undefined
        }
    }
}

export type NomWindowFields = {
    nom_available_from?: string | null,
    nom_available_until?: string | null,
    nom_opens_at?: string | null,
    nom_closes_at?: string | null,
}

export function useMapCooldownText() {
    const t = useTranslations('maps.table')
    const toDayjs = useLocalDayjs()
    useSyncExternalStore(subscribeMinute, () => minute, () => 0)

    const label = (blockers: MapBlockers): string => {
        const parts: string[] = []
        if (blockers.mapsLeft != null) parts.push(t('mapsLeft', {count: blockers.mapsLeft}))
        if (blockers.cooldownUntil) parts.push(toDayjs(blockers.cooldownUntil).fromNow(true))
        if (blockers.opensAt) parts.push(t('opensIn', {time: toDayjs(blockers.opensAt).fromNow(true)}))
        return parts.join(' · ')
    }

    const window = (fields: NomWindowFields): string | null => {
        const local = localNomWindow(
            fields.nom_available_from, fields.nom_available_until, fields.nom_opens_at, fields.nom_closes_at, toDayjs,
        )
        return local ? t('nomWindow', {start: local.start.format('LT'), end: local.end.format('LT')}) : null
    }

    const details = (blockers: MapBlockers, fields: NomWindowFields): string[] => {
        const lines: string[] = []
        if (blockers.cooldownUntil) lines.push(t('cooldownEndsAt', {time: toDayjs(blockers.cooldownUntil).format('lll')}))
        if (blockers.opensAt) lines.push(t('opensAt', {time: toDayjs(blockers.opensAt).format('lll')}))
        const nomWindow = window(fields)
        if (nomWindow) lines.push(nomWindow)
        return lines
    }

    return {label, window, details}
}
