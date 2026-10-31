'use client'
import {useTranslations} from 'next-intl';
import dayjs from "lib/dayjs";
import { Card } from "components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/ui/select";
import PlayTimeHeatmap from "./PlayTimeHeatmap";
import { ReactNode, useState } from "react";
import { Server } from "types/community.ts";
import { PlayerInfo } from "../../app/servers/[server_slug]/players/[player_id]/util.ts";
import {splitPeriod, splitRange, usePeriod} from "components/period/Period";
import { PlayerStatSuspense } from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch";
import { PeriodTitle } from "./common";

export function LabeledSelect({ label, value, onValueChange, options, triggerClassName = "w-[100px]" }: {
    label: string, value: string, onValueChange: (value: string) => void, options: [string, ReactNode][],
    triggerClassName?: string,
}) {
    return (
        <div className="flex gap-0 rounded-md border overflow-hidden">
            <div className="border-r bg-background p-1 px-3">
                {label}
            </div>
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger className={`${triggerClassName} border-0 rounded-none h-9 text-sm font-medium`}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map(([optionValue, optionLabel]) => (
                        <SelectItem key={optionValue} value={optionValue}>
                            {optionLabel}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export default function PlayerDetailHourBar({ player, server }: { server: Server, player: PlayerInfo }) {
    const t = useTranslations('players.hourBar');
    const [groupByTime, setGroupByTime] = useState<"daily" | "monthly" | "yearly">("daily")

    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth())
    const [availableYears, setAvailableYears] = useState<number[]>(() => [new Date().getFullYear()])
    const [ totalPlayTime, setTotalPlayTime ] = useState<number>(0)

    const [ sumMethodYearly, setSumMethodYearly ] = useState<"monthly" | "yearly">("yearly")
    const { period } = usePeriod()
    const range = period ? splitRange(period) : null
    const scope = period && !range ? splitPeriod(period) : null
    const [ periodGroup, setPeriodGroup ] = useState<"daily" | "monthly">("daily")

    const viewGroupBy = range ? "daily"
        : !scope ? groupByTime
        : scope.month !== null ? "monthly"
        : periodGroup === "monthly" ? "yearly" : "daily"
    const viewYear = scope?.year ?? selectedYear
    const viewMonth = scope?.month != null ? scope.month - 1 : selectedMonth
    const viewSumMethod = period ? "monthly" : sumMethodYearly
    const handleYearsLoaded = (years: number[]) => {
        setAvailableYears(years)
        setSelectedYear(years[0])
    }

    const monthNames = Array.from({length: 12}, (_, i) => dayjs().month(i).format('MMM'))
    const translatedOptions = (...keys: string[]): [string, ReactNode][] => keys.map(key => [key, t(key)])
    const yearSelect = availableYears.length > 0 && (
        <LabeledSelect label={t('year')} value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}
            options={availableYears.map(year => [year.toString(), year])} />
    )

    return (
        <Card className="overflow-hidden border-0">
            <div className="flex justify-between items-center flex-col sm:flex-row gap-2 p-2 border-b">
                <PeriodTitle
                    title={t('title', {hours: totalPlayTime.toLocaleString()})}
                    className="flex-col sm:flex-row"
                    titleClassName="text-base font-medium"
                />

                {scope && scope.month === null && (
                    <LabeledSelect label={t('groupBy')} value={periodGroup} onValueChange={(v) => setPeriodGroup(v as "daily" | "monthly")}
                        options={translatedOptions('daily', 'monthly')} />
                )}

                {!period && <div className="flex gap-2 flex-wrap justify-end">
                    <LabeledSelect label={t('groupBy')} value={groupByTime} onValueChange={(v) => setGroupByTime(v as "daily" | "monthly" | "yearly")}
                        options={translatedOptions('daily', 'monthly', 'yearly')} />

                    {groupByTime === 'daily' && yearSelect}

                    {groupByTime === 'monthly' && (
                        <>
                            <LabeledSelect label={t('month')} value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}
                                options={monthNames.map((month, idx) => [idx.toString(), month])} />
                            {yearSelect}
                        </>
                    )}

                    {groupByTime === 'yearly'&& (
                        <>
                            <LabeledSelect label={t('sum')} value={sumMethodYearly} onValueChange={(v) => setSumMethodYearly(v as "monthly" | "yearly")}
                                options={translatedOptions('monthly', 'yearly')} />
                            {sumMethodYearly !== "yearly" && yearSelect}
                        </>
                    )}
                </div>}
            </div>

            <div className="p-1 min-h-[180px] sm:min-h-[220px]">
                <PlayerStatSuspense>
                    <PlayTimeHeatmap
                        groupBy={viewGroupBy}
                        player={player}
                        server={server}
                        selectedYear={viewYear}
                        selectedMonth={viewMonth}
                        sumMethodYearly={viewSumMethod}
                        onYearsLoaded={handleYearsLoaded}
                        onChangeTotalPlayed={setTotalPlayTime}
                        rangeFrom={range?.from.toISOString().slice(0, 10)}
                        rangeTo={range?.to.toISOString().slice(0, 10)}
                    />
                </PlayerStatSuspense>
            </div>
        </Card>
    )
}
