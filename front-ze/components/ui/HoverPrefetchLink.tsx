'use client'

import Link from 'next/link'
import {ReactNode, useState} from 'react'

export function HoverPrefetchLink({
    href,
    className=undefined,
    children,
}: {
    href: string;
    className?: string
    children: ReactNode
}) {
    const [active, setActive] = useState(false)

    return (
        <Link
            href={href}
            className={className}
            prefetch={active ? null : false}
            onMouseEnter={() => setActive(true)}
        >
            {children}
        </Link>
    )
}
