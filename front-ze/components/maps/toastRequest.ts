import {toast} from "sonner";

export type ToastMessages = { success: string, failure: string, log: string };

/** Runs a notification request, then toasts `success`, or toasts `failure` and logs the error. Never throws. */
export async function toastRequest(request: () => Promise<unknown>, { success, failure, log }: ToastMessages) {
    try {
        await request();
        toast.success(success);
    } catch (error) {
        toast.error(failure);
        console.error(log, error);
    }
}
