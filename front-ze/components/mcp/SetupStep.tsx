'use client';

import {ReactNode, useState} from 'react';
import {ChevronRight} from 'lucide-react';
import {cn} from 'components/lib/utils';

export type SetupGuideStep = {
    instruction: ReactNode,
    action?: ReactNode,
    mock: ReactNode,
};

/** A compact step picker followed by the selected instruction and its full-width app mockup. */
export default function SetupStep({steps}: { steps: SetupGuideStep[] }) {
    const [current, setCurrent] = useState(0);
    const step = steps[current];

    return (
        <div className="space-y-5">
            <div className="overflow-x-auto pb-1">
                <ol className="mx-auto flex w-max items-center px-1">
                    {steps.map((_, index) => {
                        const active = index === current;
                        return (
                            <li key={index} className="flex items-center">
                                <button
                                    type="button"
                                    onClick={() => setCurrent(index)}
                                    aria-current={active ? 'step' : undefined}
                                    className={cn(
                                        'flex size-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                        active
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground',
                                    )}
                                >
                                    {index + 1}
                                </button>
                                {index < steps.length - 1 && (
                                    <ChevronRight aria-hidden className="mx-1 size-4 text-muted-foreground sm:mx-2" />
                                )}
                            </li>
                        );
                    })}
                </ol>
            </div>

            <div className="flex gap-3 rounded-xl border bg-card p-4 sm:p-5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {current + 1}
                </span>
                <div className="space-y-3 pt-0.5">
                    <p className="leading-relaxed">{step.instruction}</p>
                    {step.action}
                </div>
            </div>

            <div
                key={current}
                className="w-full [&_.mock-frame>div:last-child]:min-h-72 sm:[&_.mock-frame>div:last-child]:min-h-80"
            >
                {step.mock}
            </div>
        </div>
    );
}
