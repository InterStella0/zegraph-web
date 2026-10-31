'use client'
import {ReactNode} from "react";
import {AlertTriangle, Info} from "lucide-react";
import {PeriodChip} from "components/period/Period";
import InfoTooltip from "components/common/InfoTooltip";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {cn} from "components/lib/utils";

/** A map card heading followed by the active period chip. */
export function PeriodHeading({ title, className, titleClassName = "text-lg", chip = true }: {
    title: ReactNode, className?: string, titleClassName?: string, chip?: boolean,
}) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <h2 className={cn("font-bold text-primary", titleClassName)}>{title}</h2>
            {chip && <PeriodChip />}
        </div>
    );
}

/**
 * PeriodHeading on the left, an info tooltip on the right, with optional `actions` before the tooltip.
 * `chip={false}` hides the period chip, for cards that scope themselves with their own control.
 */
export default function MapCardTitle({ title, tooltip, icon, actions, chip, className = "items-center mb-4", titleClassName }: {
    title: ReactNode, tooltip: ReactNode, icon?: ReactNode, actions?: ReactNode, chip?: boolean,
    className?: string, titleClassName?: string,
}) {
    return (
        <div className={cn("flex justify-between gap-2", className)}>
            <PeriodHeading title={title} titleClassName={titleClassName} chip={chip} />
            <div className="flex items-center gap-2">
                {actions}
                <InfoTooltip text={tooltip} icon={icon} />
            </div>
        </div>
    );
}

/** A bare info icon with a tooltip; shows a warning icon instead when `warn` is set. */
export function InfoHint({ text, warn = false, className, iconClassName = "h-4 w-4" }: {
    text: ReactNode, warn?: boolean, className?: string, iconClassName?: string,
}) {
    const Icon = warn ? AlertTriangle : Info;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className={cn("inline-flex", className)}>
                    <Icon className={cn(iconClassName, warn ? "text-destructive" : "opacity-70")} />
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <p>{text}</p>
            </TooltipContent>
        </Tooltip>
    );
}
