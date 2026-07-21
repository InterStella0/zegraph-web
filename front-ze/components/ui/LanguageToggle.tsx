'use client';

import { Check, Languages } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { Button } from './button';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from './dropdown-menu';
import { LOCALES, LOCALE_LABELS } from 'i18n/config';
import { setLocale } from 'app/actions/setLocale';

export default function LanguageToggle() {
    const locale = useLocale();
    const [isPending, startTransition] = useTransition();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    className="transition-transform hover:scale-110"
                    aria-label="Change language"
                >
                    <Languages className="h-5 w-5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {LOCALES.map((l) => (
                    <DropdownMenuItem
                        key={l}
                        onSelect={() => startTransition(() => setLocale(l))}
                        className="flex items-center justify-between gap-4"
                    >
                        {LOCALE_LABELS[l]}
                        {l === locale && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
