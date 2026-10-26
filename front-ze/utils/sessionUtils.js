import dayjs from "lib/dayjs";
import {color} from "chart.js/helpers";

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

export const formatSeconds = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const formatTime = (timeStr, timeZone = undefined) => new Date(timeStr).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone
});

export const getServerPopRange = (serverGraph) => {
    const counts = serverGraph.map(d => d.player_count);
    return counts.length ? `${Math.min(...counts)}-${Math.max(...counts)}` : '0-0';
};

/** The --chart-1 theme colour, which Chart.js cannot read from CSS. */
export const chartPrimary = (isDark, alpha = 1) =>
    isDark ? `oklch(0.488 0.2 330 / ${alpha})` : `oklch(0.646 0.1 330 / ${alpha})`;

const palette = (isDark) => isDark ? {
    text: 'rgba(255, 255, 255, 0.9)',
    secondary: 'rgba(255, 255, 255, 0.6)',
    divider: 'rgba(255, 255, 255, 0.12)',
    paper: 'rgba(30, 30, 30, 0.95)',
    line: 'rgba(255, 255, 255, 0.35)',
} : {
    text: 'rgba(0, 0, 0, 0.87)',
    secondary: 'rgba(0, 0, 0, 0.6)',
    divider: 'rgba(0, 0, 0, 0.12)',
    paper: 'rgba(255, 255, 255, 0.95)',
    line: 'rgba(0, 0, 0, 0.30)',
};

const toSecond = (time) => dayjs(time).millisecond(0);
const byTime = (a, b) => dayjs(a.occurred_at).diff(b.occurred_at);

/** Every round played across a player session's maps, in order. */
export const sessionMatches = (maps) => maps.flatMap(map => map.match_data ?? []).sort(byTime);

/** A vertical line annotation at `x`, labelled upwards along the line. */
export const markerLine = (x, borderColor, content, labelColor, label = {}) => ({
    type: 'line',
    xMin: x,
    xMax: x,
    borderColor,
    label: {
        display: true,
        content,
        backgroundColor: '#00000000',
        color: labelColor,
        rotation: 270,
        position: 'start',
        xAdjust: 10,
        ...label,
    },
});

const mapStartAnnotations = (maps) => maps.map(map => {
    const duration = map.ended_at !== map.started_at ? ` (${formatDuration(map.started_at, map.ended_at)})` : '';
    return markerLine(toSecond(map.started_at).toDate(), 'rgb(255,52,154)', map.map + duration, 'rgb(255, 105, 180)');
});

const getRounds = (graphMatch, sessionInfo) => {
    if (!graphMatch?.length) return [];
    const sorted = [...graphMatch].sort(byTime);
    let previous = {human_score: 0, zombie_score: 0};
    const changes = sorted.filter(match => {
        const changed = match.human_score !== previous.human_score || match.zombie_score !== previous.zombie_score;
        if (changed) previous = match;
        return changed;
    });
    const sessionEnd = sessionInfo?.ended_at ?? sorted.at(-1).occurred_at;
    return changes.map((match, i) => {
        const endAt = i + 1 < changes.length ? changes[i + 1].occurred_at : sessionEnd;
        return {
            round: i + 1,
            start: toSecond(match.occurred_at),
            end: toSecond(endAt),
            duration: formatDuration(match.occurred_at, endAt, true),
        };
    });
};

const toggleLabel = (display) => (ctx) => {
    ctx.element.label.options.display = display;
    return true;
};

export const getRoundChangeAnnotations = (graphMatch, sessionInfo, isDark) => {
    const colors = palette(isDark);
    return getRounds(graphMatch, sessionInfo).flatMap(round => [
        {
            ...markerLine(round.start.toDate(), colors.line, round.duration, colors.secondary, {xAdjust: 8, font: {size: 10}}),
            borderWidth: 1.5,
        },
        {
            type: 'box',
            xMin: round.start.valueOf(),
            xMax: round.end.valueOf(),
            backgroundColor: 'rgba(0, 0, 0, 0)',
            borderColor: 'rgba(0, 0, 0, 0)',
            enter: toggleLabel(true),
            leave: toggleLabel(false),
            label: {
                display: false,
                content: [`Round ${round.round}`, `Lasted ${round.duration}`],
                backgroundColor: colors.paper,
                color: colors.text,
                borderColor: colors.divider,
                borderWidth: 1,
                borderRadius: 4,
                position: {x: 'center', y: 'start'},
                padding: 6,
                font: {size: 11},
            },
        },
    ]);
};

export const getServerPopChartData = (serverGraph, isDark) => ({
    datasets: [{
        label: 'Player Count',
        data: serverGraph.map(item => ({x: item.bucket_time, y: item.player_count})),
        borderColor: chartPrimary(isDark),
        backgroundColor: chartPrimary(isDark, .35),
        borderWidth: 2,
        pointBackgroundColor: chartPrimary(isDark),
        pointRadius: 0,
        tension: 0.4,
        fill: true,
    }],
});

const scoreDataset = (label, lineColor, matches, score) => ({
    label,
    data: matches.map(match => ({x: toSecond(match.occurred_at).toDate(), y: match[score]})),
    borderColor: lineColor,
    backgroundColor: color(lineColor).alpha(.33).toString(),
    borderWidth: 2,
    stepped: true,
    pointRadius: 0,
    pointHoverRadius: 6,
});

export const getMatchScoreChartData = (matches) => ({
    datasets: [
        scoreDataset('Humans', 'hsl(142, 71%, 45%)', matches, 'human_score'),
        scoreDataset('Zombies', 'hsl(0, 84%, 60%)', matches, 'zombie_score'),
    ],
});

export const getChartOptionsWithAnnotations = (maps, sessionInfo, showLegend = false, suggestedMax = undefined, isDark = false, extraAnnotations = null) => {
    const colors = palette(isDark);
    const axis = (ticks = {}) => ({
        grid: {color: colors.divider},
        border: {color: colors.divider},
        ticks: {color: colors.secondary, font: {size: 12}, ...ticks},
    });

    return {
        maintainAspectRatio: false,
        interaction: {mode: 'index', intersect: false},
        plugins: {
            legend: {display: showLegend, labels: {color: colors.text}},
            annotation: {
                annotations: [...(maps ? mapStartAnnotations(maps) : []), ...(extraAnnotations ?? [])],
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: colors.paper,
                titleColor: colors.text,
                bodyColor: colors.text,
                borderColor: colors.divider,
                borderWidth: 1,
            },
        },
        scales: {
            x: {
                ...axis(),
                type: 'time',
                min: sessionInfo?.started_at,
                max: sessionInfo?.ended_at,
                time: {displayFormats: {minute: 'h:mm a', hour: 'h:mm a'}},
            },
            y: {
                ...axis({stepSize: 1}),
                suggestedMax,
                min: 0,
            },
        },
    };
};
