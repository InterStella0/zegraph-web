import {ErrorBoundary} from "react-error-boundary";
import {ReactElement, ReactNode} from "react";

export default function ErrorCatch({ message, children }: { message?: string, children: ReactNode }): ReactElement {
    return <ErrorBoundary fallback={<p>Something went wrong :/<br />{message}</p>}>
        {children}
    </ErrorBoundary>
}
