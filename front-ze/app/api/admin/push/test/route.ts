import { proxyToBackendChange} from "lib/apiProxy";
import {TestPushNotification} from "types/notifications.ts";

// POST /api/admin/push/test
export async function POST(req: Request) {
    const body: TestPushNotification = await req.json();
    return await proxyToBackendChange<TestPushNotification>("/admin/push/test", body);
}
