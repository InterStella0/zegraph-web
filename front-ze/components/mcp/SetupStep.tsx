import {ReactNode} from 'react';

/** One numbered instruction next to the recreated app screen that illustrates it. */
export default function SetupStep({n, children, action, mock}: {
    n: number,
    children: ReactNode,
    action?: ReactNode,
    mock: ReactNode,
}) {
    return (
        <li className="grid items-center gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6">
            <div className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {n}
                </span>
                <div className="space-y-3 pt-0.5">
                    <p className="leading-relaxed">{children}</p>
                    {action}
                </div>
            </div>
            {mock}
        </li>
    );
}
