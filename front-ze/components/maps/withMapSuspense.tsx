import {ComponentType, Suspense} from "react";
import {useTranslations} from "next-intl";
import ErrorCatch from "components/ui/ErrorMessage.tsx";
import {Translate} from "components/common/withErrorCatch";
import {EmptyMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";

export function withMapSuspense<P extends object>(Display: ComponentType<Partial<P>>, message: (t: Translate) => string) {
    return function WithMapSuspense(props: Partial<P>) {
        const t = useTranslations();
        return <ErrorCatch message={message(t)}>
            <Suspense fallback={<EmptyMapContext><Display /></EmptyMapContext>}>
                <Display {...props} />
            </Suspense>
        </ErrorCatch>
    }
}
