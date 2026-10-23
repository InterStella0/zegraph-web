import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Stores a site-wide cookie for a year; null deletes it. */
export function setCookie(name: string, value: string | null) {
  const stored = value === null ? '' : encodeURIComponent(value)
  document.cookie = `${name}=${stored}; path=/; max-age=${value === null ? 0 : 31536000}; SameSite=Lax`
}
