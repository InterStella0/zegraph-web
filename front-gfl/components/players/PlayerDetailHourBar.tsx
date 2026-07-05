'use client'
import {useTranslations} from 'next-intl';
import dayjs from 'dayjs';
import { Card } from "components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "components/ui/select";
import PlayTimeHeatmap from "./PlayTimeHeatmap";
import { useState } from "react";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import { Server } from "types/community.ts";
import { PlayerInfo } from "../../app/servers/[server_slug]/players/[player_id]/util.ts";
import type { PlayerSessionTime } from "./PlayTimeHeatmap";

export default function PlayerDetailHourBar({ player, server }: { server: Server, player: PlayerInfo }) {
    const t = useTranslations('players.hourBar');
    // Group by state (remove "weekly")
    const [groupByTime, setGroupByTime] = useState<"daily" | "monthly" | "yearly">("daily")

    // Period selection state
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()) // 0-11
    const [availableYears, setAvailableYears] = useState<number[]>([])
    const [ totalPlayTime, setTotalPlayTime ] = useState<number>(0)

    const [ sumMethodYearly, setSumMethodYearly ] = useState<"monthly" | "yearly">("yearly")
    const handleGroupChange = (value: string) => {
        setGroupByTime(value as "daily" | "monthly" | "yearly")
    }

    const handleDataLoaded = (data: { years: number[], months: number[], rawData: PlayerSessionTime[] }) => {
        setAvailableYears(data.years)
        if (data.years.length > 0) {
            setSelectedYear(data.years[0])  // Most recent year
        }
    }

    const monthNames = Array.from({length: 12}, (_, i) => dayjs().month(i).format('MMM'))

    return (
        <Card className="overflow-hidden border-0">
            <div className="flex justify-between items-center flex-col sm:flex-row gap-2 p-2 border-b">
                <h2 className="text-base font-medium">
                    {t('title', {hours: totalPlayTime.toLocaleString()})}
                </h2>

                <div className="flex gap-2 flex-wrap justify-end">
                    {/* Group By selector */}
                    <div className="flex gap-0 rounded-md border overflow-hidden">
                        <div className="border-r bg-background p-1 px-3">
                            {t('groupBy')}
                        </div>
                        <Select value={groupByTime} onValueChange={handleGroupChange}>
                            <SelectTrigger className="w-[100px] border-0 rounded-none h-9 text-sm font-medium">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="daily">{t('daily')}</SelectItem>
                                <SelectItem value="monthly">{t('monthly')}</SelectItem>
                                <SelectItem value="yearly">{t('yearly')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Year selector for daily view */}
                    {groupByTime === 'daily' && availableYears.length > 0 && (
                        <div className="flex gap-0 rounded-md border overflow-hidden">
                            <div className="border-r bg-background p-1 px-3">
                                {t('year')}
                            </div>
                            <Select
                                value={selectedYear.toString()}
                                onValueChange={(v) => setSelectedYear(parseInt(v))}
                            >
                                <SelectTrigger className="w-[100px] border-0 rounded-none h-9 text-sm font-medium">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableYears.map(year => (
                                        <SelectItem key={year} value={year.toString()}>
                                            {year}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Month + Year selectors for monthly view */}
                    {groupByTime === 'monthly' && (
                        <>
                            <div className="flex gap-0 rounded-md border overflow-hidden">
                                <div className="border-r bg-background p-1 px-3">
                                    {t('month')}
                                </div>
                                <Select
                                    value={selectedMonth.toString()}
                                    onValueChange={(v) => setSelectedMonth(parseInt(v))}
                                >
                                    <SelectTrigger className="w-[100px] border-0 rounded-none h-9 text-sm font-medium">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {monthNames.map((month, idx) => (
                                            <SelectItem key={idx} value={idx.toString()}>
                                                {month}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {availableYears.length > 0 && (
                                <div className="flex gap-0 rounded-md border overflow-hidden">
                                    <div className="border-r bg-background p-1 px-3">
                                        {t('year')}
                                    </div>
                                    <Select
                                        value={selectedYear.toString()}
                                        onValueChange={(v) => setSelectedYear(parseInt(v))}
                                    >
                                        <SelectTrigger className="w-[100px] border-0 rounded-none h-9 text-sm font-medium">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableYears.map(year => (
                                                <SelectItem key={year} value={year.toString()}>
                                                    {year}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </>
                    )}

                    {groupByTime === 'yearly'&& (
                        <>
                            <div className="flex gap-0 rounded-md border overflow-hidden">
                                <div className="border-r bg-background p-1 px-3">
                                    {t('sum')}
                                </div>
                                <Select
                                    value={sumMethodYearly}
                                    onValueChange={(v) => setSumMethodYearly(v as "monthly" | "yearly")}
                                >
                                    <SelectTrigger className="w-[100px] border-0 rounded-none h-9 text-sm font-medium">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly">
                                            {t('monthly')}
                                        </SelectItem>
                                        <SelectItem value="yearly">
                                            {t('yearly')}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {availableYears.length > 0 && sumMethodYearly !== "yearly" && (
                                <div className="flex gap-0 rounded-md border overflow-hidden">
                                    <div className="border-r bg-background p-1 px-3">
                                        {t('year')}
                                    </div>
                                    <Select
                                        value={selectedYear.toString()}
                                        onValueChange={(v) => setSelectedYear(parseInt(v))}
                                    >
                                        <SelectTrigger className="w-[100px] border-0 rounded-none h-9 text-sm font-medium">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableYears.map(year => (
                                                <SelectItem key={year} value={year.toString()}>
                                                    {year}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="p-1 min-h-[180px] sm:min-h-[220px]">
                <PlayTimeHeatmap
                    groupBy={groupByTime}
                    player={player}
                    server={server}
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    sumMethodYearly={sumMethodYearly}
                    onDataLoaded={handleDataLoaded}
                    onChangeTotalPlayed={setTotalPlayTime}
                />
            </div>
        </Card>
    )
}
