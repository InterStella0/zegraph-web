'use client'
import {use, useEffect} from "react";
import {useRouter} from "next/navigation";
import {SteamProfile} from "types/steam";

const CHECKED_KEY = 'steam-profile-checked-at';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * The navbar avatar comes from the session token, which only copies the Steam profile at sign-in.
 * Once a day this asks NextAuth to re-read it (the backend pulls from playerdb.co weekly) and
 * re-renders if the avatar or name changed.
 */
export default function SteamProfileRefresher({ userPromise }: { userPromise: Promise<SteamProfile | null> }) {
    const user = use(userPromise);
    const router = useRouter();

    useEffect(() => {
        if (!user) return;
        const checkedAt = Number(localStorage.getItem(CHECKED_KEY) ?? 0);
        if (Date.now() - checkedAt < CHECK_INTERVAL_MS) return;
        localStorage.setItem(CHECKED_KEY, String(Date.now()));

        (async () => {
            const { csrfToken } = await fetch('/api/auth/csrf').then(r => r.json());
            const session = await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csrfToken, data: {} }),
            }).then(r => r.json());
            const fresh: SteamProfile | undefined = session?.user?.steam;
            if (fresh && (fresh.avatar !== user.avatar || fresh.personaname !== user.personaname)) {
                router.refresh();
            }
        })().catch(e => console.error('Failed to refresh Steam profile:', e));
    }, [user, router]);

    return null;
}
