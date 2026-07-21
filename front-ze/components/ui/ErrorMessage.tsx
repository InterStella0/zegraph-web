import {ErrorBoundary} from "react-error-boundary";
import {ReactElement, ReactNode} from "react";

function ErrorMessage({ message }: { message: string }): ReactElement {
    return <p>Something went wrong :/<br />
        {message}
    </p>
}
export default function ErrorCatch({ message, children }: { message: string, children: ReactNode }): ReactElement {
    return <ErrorBoundary fallback={<ErrorMessage message={message} />}>
        {children}
    </ErrorBoundary>
}