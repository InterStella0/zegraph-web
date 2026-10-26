'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from './button';
import { useHydrated } from 'lib/hooks/useHydrated';

export default function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const hydrated = useHydrated();
  // The theme is only known in the browser, so the server renders a disabled placeholder.
  if (!hydrated) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';
  const Icon = isDark ? Sun : Moon;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="transition-transform hover:scale-110"
      aria-label="Toggle theme"
    >
      <Icon className="h-5 w-5 transition-transform rotate-0 scale-100" />
    </Button>
  );
}
