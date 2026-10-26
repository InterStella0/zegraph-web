'use client'
import {useTranslations} from 'next-intl';
import { useTheme } from 'next-themes';
import { LazyLineChart as Line } from 'components/graphs/LazyCharts';
import { getMatchScoreChartData, getChartOptionsWithAnnotations, sessionMatches } from 'utils/sessionUtils.js';
import {PlayerSession} from "types/players.js";
import {PlayerSessionMapPlayed} from "../../app/servers/[server_slug]/util.js";
import { formatNumber } from "utils/generalUtils";
import {SessionChartCard} from "./SessionLayout";

const plural = (count: number, noun: string) => `${formatNumber(count)} ${noun}${count !== 1 ? 's' : ''}`;

export default function MatchScoreChart(
    {sessionInfo, maps}
    : {sessionInfo: PlayerSession, maps: PlayerSessionMapPlayed[]}
) {
    const t = useTranslations('sessions');
    const isDark = useTheme().resolvedTheme === 'dark';
    const matches = sessionMatches(maps);

    let summary = t('noMatchScoreData');
    if (maps?.length) {
        const zombieWins = matches.filter(match => match.zombie_score > match.human_score).length;
        const humanWins = matches.filter(match => match.human_score > match.zombie_score).length;
        const ties = matches.length - zombieWins - humanWins;
        summary = `Match scores across ${plural(maps.length, 'map')} and ${plural(matches.length, 'round')}. ` +
            `Zombie wins: ${formatNumber(zombieWins)}, Human wins: ${formatNumber(humanWins)}` +
            (ties > 0 ? `, Ties: ${formatNumber(ties)}` : '') + '.';
    }

    return (
        <SessionChartCard title={t('matchScoreProgression')} description={t('roundByRound')} summaryId="match-score-summary" summary={summary}>
            <Line
                data={getMatchScoreChartData(matches)}
                // @ts-ignore
                options={getChartOptionsWithAnnotations(maps, sessionInfo, true, 5, isDark)}
            />
        </SessionChartCard>
    );
};
