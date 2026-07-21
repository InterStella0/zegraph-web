'use client'
import dynamic from "next/dynamic";
import dayjs from "dayjs";
const RadarMap = dynamic(() => import("components/radars/RadarMap"), {
    ssr: false,
});

export default function RadarSessionPreview({ start, end }: { start: string; end: string | null }) {
    const started = dayjs(start)
    const ended = end? dayjs(end): dayjs()
    return <>
        <RadarMap dateDisplay={{ start: started, end: ended }} height="45vh" />
    </>
}