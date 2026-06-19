import React from "react"
import { cn } from "components/lib/utils"

export function AdSpot({ className }: { className?: string }) {
  const adClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID
  const adSlot = process.env.NEXT_PUBLIC_ADSENSE_AD_SLOT

  console.log("SET HERE", adSlot, adClient)
  if (!adClient || !adSlot) {
    return (
      <div className={cn(
        "relative flex items-center justify-center rounded-xl",
        "border border-dashed border-border",
        "bg-gradient-to-br from-muted/60 to-muted/30",
        "min-h-[90px] overflow-hidden",
        className
      )}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[radial-gradient(ellipse_at_50%_50%,var(--primary),transparent_70%)]" />
        <div className="flex flex-col items-center gap-1 select-none">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
            advertisement
          </span>
          <span className="text-muted-foreground/25 text-xs">[ sorry uwu ]</span>
        </div>
        <span className="absolute top-2 right-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/35">
          ad
        </span>
      </div>
    )
  }

  return (
    <div className={cn("rounded-xl", className)}>
      {React.createElement("amp-ad", {
        width: "100vw",
        height: "320",
        type: "adsense",
        "data-ad-client": adClient,
        "data-ad-slot": adSlot,
        "data-auto-format": "rspv",
        "data-full-width": "",
      }, React.createElement("div", { overflow: "" }))}
    </div>
  )
}
