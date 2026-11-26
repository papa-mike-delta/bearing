"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Label as AriaLabel, LabelContext } from "react-aria-components"

import { useThemeSelection } from "@/components/theme-selection"
import { cn } from "@/lib/utils"

function Label({
  className,
  htmlFor,
  ...props
}: React.ComponentProps<"label">) {
  const { base } = useThemeSelection()
  const classes = cn(
    "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
    className
  )
  if (base === "base") return <label data-slot="label" data-theme-base={base} className={classes} htmlFor={htmlFor} {...props} />
  if (base === "aria") {
    const label = <AriaLabel data-slot="label" data-theme-base={base} className={classes} htmlFor={htmlFor} {...props} />
    return htmlFor ? <LabelContext.Provider value={null}>{label}</LabelContext.Provider> : label
  }
  return <LabelPrimitive.Root data-slot="label" data-theme-base={base} className={classes} htmlFor={htmlFor} {...props} />
}

export { Label }
