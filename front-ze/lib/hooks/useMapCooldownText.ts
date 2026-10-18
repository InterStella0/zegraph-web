'use client'
import {useTranslations} from 'next-intl'
import {useLocalDayjs} from 'lib/hooks/useHydrated'
import {localNomWindow, MapBlockers} from 'utils/mapCooldown'

export type NomWindowFields = {
    nom_available_from?: string | null,
    nom_available_until?: string | null,
    nom_opens_at?: string | null,
    nom_closes_at?: string | null,
}

export function useMapCooldownText() {
    const t = useTranslations('maps.table')
    const toDayjs = useLocalDayjs()

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
