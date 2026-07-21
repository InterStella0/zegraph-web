"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "components/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all data-[state=indeterminate]:w-1/3 data-[state=indeterminate]:animate-progress-indeterminate"
        style={value == null ? undefined : { transform: `translateX(-${100 - value}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
