import {ComponentType, ReactNode} from "react";
import {Card, CardContent, CardHeader} from "components/ui/card";

/** A card whose header is an icon, a title (or a custom `heading`) and an optional `action` on the right. */
export function IconCard({ icon: Icon, title, heading, action, className, titleClassName = "text-lg max-sm:text-md font-semibold", children }: {
    icon: ComponentType<{ className?: string }>,
    title?: ReactNode,
    heading?: ReactNode,
    action?: ReactNode,
    className?: string,
    titleClassName?: string,
    children: ReactNode,
}) {
    return (
        <Card className={className}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-primary"/>
                    {heading ?? <h2 className={titleClassName}>{title}</h2>}
                </div>
                {action}
            </CardHeader>
            <CardContent className="pt-0">{children}</CardContent>
        </Card>
    );
}
