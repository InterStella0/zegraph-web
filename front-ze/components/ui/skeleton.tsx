import { cn } from "components/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

// Stands in for a line of text. The zero-width space gives the line its real height, so nothing shifts when text replaces it.
function SkeletonText({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <><Skeleton className={cn("inline-block align-middle", className)} {...props} />{'​'}</>
}

// Stands in for a Badge of the same box size.
function SkeletonBadge({ className }: { className?: string }) {
  return <Skeleton className={cn("inline-flex border border-transparent px-2 py-0.5 text-xs rounded-full", className)}>{'​'}</Skeleton>
}

// Deterministic per-row width so skeleton lists look varied yet render the same on server and client.
const varyWidth = (index: number, base = 5, spread = 6, step = 3) => ({ width: `${base + (index * step) % spread}rem` })

export { Skeleton, SkeletonText, SkeletonBadge, varyWidth }
