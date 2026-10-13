import {ComponentType} from "react";
import {useTranslations} from "next-intl";
import ErrorCatch from "components/ui/ErrorMessage.tsx";

export type Translate = ReturnType<typeof useTranslations>;

export function withErrorCatch<P extends object>(Display: ComponentType<P>, message: (t: Translate) => string) {
    return function WithErrorCatch(props: P) {
        const t = useTranslations();
        return <ErrorCatch message={message(t)}>
            <Display {...props} />
        </ErrorCatch>
    }
}
