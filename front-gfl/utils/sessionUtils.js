import dayjs from "dayjs";
import duration from 'dayjs/plugin/duration';
import {color} from "chart.js/helpers";
dayjs.extend(duration);

export const formatDuration = (start, end, withSeconds = false) => {
    if (!start || !end) return withSeconds ? '0s' : '0m';
    const totalSeconds = dayjs(end).diff(dayjs(start), "seconds");
    const dur = dayjs.duration(totalSeconds, 'seconds');
    const hours = dur.hours();
    const minutes = dur.minutes();
    const seconds = dur.seconds();
    if (hours > 0)
        return `${hours}h ${minutes}m`;
    if (withSeconds)
        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    return `${minutes}m`;
};

export const formatTime = (timeStr) => {
    return new Date(timeStr).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
};

export const getServerPopRange = (serverGraph) => {
    if (serverGraph.length === 0) return '0-0';
    const min = Math.min(...serverGraph.map(d => d.player_count));
    const max = Math.max(...serverGraph.map(d => d.player_count));
    return `${min}-${max}`;
};

export const generateMatchScoreData = (maps) => {
    const data = [];
    let all_match = maps.map(data => data.match_data).flat(2).map(match => {
        match.timeAt = dayjs(match.occurred_at)
        return match
    })
    all_match.sort((a, b) => a.timeAt.isAfter(b.timeAt) ? 1 : -1)
    all_match.forEach(matchData => {
        data.push({
            x: matchData.occurred_at,
            humanScore: matchData.human_score,
            zombieScore: matchData.zombie_score
        });
    });
    return data;
};

export const getMapStartAnnotations = (maps) => {
    return maps.map(map => {
        let text = map.map;
        if (map.ended_at !== map.started_at) {
            text += ` (${formatDuration(map.started_at, map.ended_at)})`;
        }
        let date = dayjs(map.started_at).millisecond(0).toDate()
        return {
            type: 'line',
            xMin: date,
            xMax: date,
            borderColor: 'rgb(255,52,154)',
            label: {
                backgroundColor: '#00000000',
                content: text,
                display: true,
                rotation: 270,
                color: 'rgb(255, 105, 180)',
                position: 'start',
                xAdjust: 10,
            }
        }
    });
};

export const getRounds = (graphMatch, sessionInfo) => {
    if (!graphMatch || graphMatch.length === 0) return [];

    const sorted = [...graphMatch].sort((a, b) =>
        dayjs(a.occurred_at).isAfter(dayjs(b.occurred_at)) ? 1 : -1
    );

    // Collect distinct score-change events; each one starts a new round.
    const changes = [];
    let prevHuman = 0;
    let prevZombie = 0;

    for (const match of sorted) {
        const scoreChanged =
            match.human_score !== prevHuman ||
            match.zombie_score !== prevZombie;

        if (!scoreChanged) continue;

        changes.push(match);
        prevHuman = match.human_score;
        prevZombie = match.zombie_score;
    }

    const sessionEnd = sessionInfo?.ended_at ?? sorted[sorted.length - 1].occurred_at;

    // A round's line sits at its score change and the band extends to the right,
    // up to the next change (or session end for the last one).
    return changes.map((match, i) => {
        const endAt = i + 1 < changes.length ? changes[i + 1].occurred_at : sessionEnd;
        return {
            round: i + 1,
            date: dayjs(match.occurred_at).millisecond(0).toDate(),
            startMs: dayjs(match.occurred_at).millisecond(0).valueOf(),
            endMs: dayjs(endAt).millisecond(0).valueOf(),
            duration: formatDuration(match.occurred_at, endAt, true),
            humanScore: match.human_score,
            zombieScore: match.zombie_score,
        };
    });
};

export const getRoundChangeAnnotations = (graphMatch, sessionInfo, isDark) => {
    const lineColor = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.30)';
    const labelColor = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
    const textColor = isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)';
    const tooltipBg = isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const dividerColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';

    const annotations = [];
    for (const r of getRounds(graphMatch, sessionInfo)) {
        annotations.push({
            type: 'line',
            xMin: r.date,
            xMax: r.date,
            borderColor: lineColor,
            borderWidth: 1.5,
            label: {
                display: true,
                content: r.duration,
                backgroundColor: '#00000000',
                color: labelColor,
                rotation: 270,
                position: 'start',
                xAdjust: 8,
                font: {
                    size: 10,
                },
            }
        });

        // Full-height transparent hover target covering the round's band (to the
        // right of the line) that reveals a fuller label on hover.
        annotations.push({
            type: 'box',
            xMin: r.startMs,
            xMax: r.endMs,
            backgroundColor: 'rgba(0, 0, 0, 0)',
            borderColor: 'rgba(0, 0, 0, 0)',
            enter(ctx) {
                ctx.element.label.options.display = true;
                return true;
            },
            leave(ctx) {
                ctx.element.label.options.display = false;
                return true;
            },
            label: {
                display: false,
                content: [`Round ${r.round}`, `Lasted ${r.duration}`],
                backgroundColor: tooltipBg,
                color: textColor,
                borderColor: dividerColor,
                borderWidth: 1,
                borderRadius: 4,
                position: {
                    x: 'center',
                    y: 'start',
                },
                padding: 6,
                font: {
                    size: 11,
                },
            }
        });
    }
    return annotations;
};

export const getServerPopChartData = (serverGraph, isDark) => {
    const primaryColor = isDark? 'oklch(0.488 0.2 330)': 'oklch(0.646 0.1 330)' // --chart-1
    const primaryColorAlpha = isDark? 'oklch(0.488 0.2 330 / .35)': 'oklch(0.646 0.1 330 / .35)'

    const data = serverGraph.map(item => ({
        x: item.bucket_time,
        y: item.player_count
    }));

    return {
        datasets: [
            {
                label: 'Player Count',
                data,
                borderColor: primaryColor,
                backgroundColor: primaryColorAlpha,
                borderWidth: 2,
                pointBackgroundColor: primaryColor,
                pointRadius: 0,
                tension: 0.4,
                fill: true
            }
        ]
    };
};

export const getMatchScoreChartData = (data, type) => {
    // Theme colors
    const successColor = 'hsl(142, 71%, 45%)'; // Green for humans
    const errorColor = 'hsl(0, 84%, 60%)';     // Red for zombies

    let matchData;
    switch (type) {
        case "player":
            matchData = generateMatchScoreData(data);
            break;
        case "map":
            matchData = data?.map(matchData => ({
                x: matchData.occurred_at,
                humanScore: matchData.human_score,
                zombieScore: matchData.zombie_score
            })) ?? [];
            break;
        default:
            return { datasets: [] };
    }

    return {
        datasets: [
            {
                label: 'Humans',
                data: matchData.map(item => ({
                    x: dayjs(item.x).millisecond(0).toDate(),
                    y: item.humanScore
                })),
                borderColor: successColor,
                backgroundColor: color(successColor).alpha(.33).toString(),
                borderWidth: 2,
                stepped: true,
                pointRadius: 0,
                pointHoverRadius: 6
            },
            {
                label: 'Zombies',
                data: matchData.map(item => ({
                    x: dayjs(item.x).millisecond(0).toDate(),
                    y: item.zombieScore
                })),
                borderColor: errorColor,
                backgroundColor: color(errorColor).alpha(.33).toString(),
                borderWidth: 2,
                stepped: true,
                pointRadius: 0,
                pointHoverRadius: 6
            }
        ]
    };
};

export const getChartOptionsWithAnnotations = (maps, sessionInfo, showLegend = false, suggestedMax = undefined, isDark = false, extraAnnotations = null) => {
    const textColor = isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)';
    const secondaryTextColor = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
    const dividerColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';
    const paperBg = isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)';

    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                display: showLegend,
                labels: {
                    color: textColor
                },
            },
            annotation: {
                annotations: [
                    ...(maps ? getMapStartAnnotations(maps) : []),
                    ...(extraAnnotations ?? []),
                ],
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: paperBg,
                titleColor: textColor,
                bodyColor: textColor,
                borderColor: dividerColor,
                borderWidth: 1,
            },
        },
        scales: {
            x: {
                type: 'time',
                min: sessionInfo?.started_at,
                max: sessionInfo?.ended_at,
                time: {
                    displayFormats: {
                        minute: 'h:mm a',
                        hour: 'h:mm a',
                    },
                },
                grid: {
                    color: dividerColor
                },
                ticks: {
                    color: secondaryTextColor,
                    font: {
                        size: 12,
                    },
                },
                border: {
                    color: dividerColor
                },
            },
            y: {
                border: {
                    color: dividerColor
                },
                grid: {
                    color: dividerColor
                },
                ticks: {
                    color: secondaryTextColor,
                    font: {
                        size: 12,
                    },
                    stepSize: 1,
                },
                suggestedMax: suggestedMax,
                min: 0,
            },
        },
    };
};
