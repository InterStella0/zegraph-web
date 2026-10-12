import {useEffect, useMemo, useState} from "react";
import {LayerGroup, Pane, Polygon} from "react-leaflet";
import dayjs, {Dayjs} from "dayjs";
import {useTheme} from "next-themes";
import {nightPolygons} from "utils/terminator.ts";

type BandStyle = { stroke: false, fillColor: string, fillOpacity: number };
type ShadingStyle = { basemap: string, night: BandStyle };

export const NIGHT_SHADING_STYLE: Record<'light' | 'dark', ShadingStyle> = {
    light: {
        basemap: '#f2efe9',
        night: {stroke: false, fillColor: '#000000', fillOpacity: 0.12},
    },
    dark: {
        basemap: '#0a0c0f',
        night: {stroke: false, fillColor: '#000000', fillOpacity: 0.15},
    },
};

function useLiveMinute(enabled: boolean): number {
    const [now, setNow] = useState(() => dayjs().startOf('minute').valueOf());
    useEffect(() => {
        if (!enabled) return;
        setNow(dayjs().startOf('minute').valueOf());
        const timer = setInterval(() => setNow(dayjs().startOf('minute').valueOf()), 60_000);
        return () => clearInterval(timer);
    }, [enabled]);
    return now;
}

export default function NightShadingLayer({ time, live = false }: { time?: Dayjs, live?: boolean }) {
    const liveMinute = useLiveMinute(live);
    const minute = live || !time ? liveMinute : time.startOf('minute').valueOf();
    const { resolvedTheme } = useTheme();
    const style = NIGHT_SHADING_STYLE[resolvedTheme === 'dark' ? 'dark' : 'light'];
    const bands = useMemo(() => nightPolygons(new Date(minute)), [minute]);

    return <Pane name="nightShading" style={{ zIndex: 250, pointerEvents: 'none' }}>
        <LayerGroup>
            {bands.map((band, i) => (
                <Polygon key={i} positions={band} interactive={false} pathOptions={style.night} />
            ))}
        </LayerGroup>
    </Pane>
}
