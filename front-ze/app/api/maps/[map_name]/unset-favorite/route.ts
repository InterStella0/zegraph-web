import { proxyToBackendChange } from "lib/apiProxy";

export async function POST(_req: Request, context: { params: Promise<{ map_name: string }> }) {
    const { map_name } = await context.params;
    return proxyToBackendChange(`/maps/${encodeURIComponent(map_name)}/unset-favorite`);
}
