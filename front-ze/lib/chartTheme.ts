'use client'
import {useMemo} from "react";
import {useTheme} from "next-themes";

export function chartTheme(isDark: boolean) {
    const foreground = isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)';
    const border = isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)';
    return {
        isDark,
        foreground,
        border,
        muted: isDark ? 'hsl(215 20.2% 65.1%)' : 'hsl(215.4 16.3% 46.9%)',
        background: isDark ? 'hsl(222.2 84% 4.9%)' : 'hsl(0 0% 100%)',
        faintGrid: isDark ? 'hsla(217.2, 32.6%, 17.5%, 0.3)' : 'hsla(214.3, 31.8%, 91.4%, 0.3)',
        primary: isDark ? 'hsl(217.2 91.2% 59.8%)' : 'hsl(221.2 83.2% 53.3%)',
        success: isDark ? 'hsl(142.1 76.2% 36.3%)' : 'hsl(142.1 70.6% 45.3%)',
        destructive: isDark ? 'hsl(0 84.2% 60.2%)' : 'hsl(0 72.2% 50.6%)',
        heat: isDark ? 'rgb(229, 82, 157)' : 'rgb(235, 195, 218)',
        tooltip: {
            backgroundColor: isDark ? 'rgba(50, 50, 50, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: foreground,
            bodyColor: foreground,
            borderColor: border,
            borderWidth: 1,
        },
    };
}

export type ChartTheme = ReturnType<typeof chartTheme>;

export function useChartTheme(): ChartTheme {
    const isDark = useTheme().resolvedTheme === 'dark';
    return useMemo(() => chartTheme(isDark), [isDark]);
}

export function heatmapTooltip(theme: ChartTheme) {
    return {
        backgroundColor: theme.background,
        titleColor: theme.foreground,
        bodyColor: theme.foreground,
        borderColor: theme.faintGrid,
        borderWidth: 1,
    };
}
