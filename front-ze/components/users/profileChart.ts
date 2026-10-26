import { color } from "chart.js/helpers";
import { ChartTheme } from "lib/chartTheme";

/** `colour` at the given opacity, for chart fills and tinted badges. */
export const tint = (colour: string, alpha: number) => color(colour).alpha(alpha).rgbString();

/** One community's series: a translucent fill with a solid outline. */
export const communitySeries = (label: string, data: number[], colour: string, alpha = 0.8) =>
    ({ label, data, backgroundColor: tint(colour, alpha), borderColor: colour, borderWidth: 1 });

export const categoryAxis = (theme: ChartTheme) =>
    ({ stacked: true, ticks: { color: theme.foreground }, grid: { display: false } });

export const valueAxis = (text: string, ink: string, theme: ChartTheme) => ({
    stacked: true,
    beginAtZero: true,
    title: { display: true, text, color: ink },
    ticks: { color: ink },
    grid: { color: theme.faintGrid },
});
