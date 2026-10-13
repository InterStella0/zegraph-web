import {ComponentType, Suspense} from "react";
import {useTranslations} from "next-intl";
import ErrorCatch from "components/ui/ErrorMessage.tsx";
import {EmptyMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";

type Translate = ReturnType<typeof useTranslations>;

export function withErrorCatch<P extends object>(Display: ComponentType<P>, message: (t: Translate) => string) {
    return function WithErrorCatch(props: P) {
        const t = useTranslations();
        return <ErrorCatch message={message(t)}>
            <Display {...props} />
        </ErrorCatch>
    }
}

export function withMapSuspense<P extends object>(Display: ComponentType<P>, message: (t: Translate) => string) {
    return function WithMapSuspense(props: P) {
        const t = useTranslations();
        return <ErrorCatch message={message(t)}>
            <Suspense fallback={<EmptyMapContext><Display {...{} as P} /></EmptyMapContext>}>
                <Display {...props} />
            </Suspense>
        </ErrorCatch>
    }
}
