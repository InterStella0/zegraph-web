import { use } from "react";
import { notFound } from "next/navigation";
import MapSessionWrapper from "./MapSessionWrapper.tsx";
import type { SessionData } from "./utils.ts";

export default function ResolveMapSession({ sessionPromise }: { sessionPromise: Promise<SessionData> }) {
    let data: SessionData;
    try {
        data = use(sessionPromise);
    } catch (err: any) {
        if (err && typeof err.then === "function") throw err;
        if (err?.code === 404 || err?.code === 400) notFound();
        throw err;
    }
    return <MapSessionWrapper initialData={data} />;
}
