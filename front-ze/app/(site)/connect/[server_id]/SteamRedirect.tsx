'use client'
import {useEffect} from "react";

/** Launches Steam once mounted. An inline `<script>` would only run on a full page load; React
 *  never executes one inserted during client-side navigation. */
export default function SteamRedirect({ href }: { href: string }) {
    useEffect(() => {
        window.location.href = href
    }, [href])
    return null
}
