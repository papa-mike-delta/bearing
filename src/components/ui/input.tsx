"use client"

import * as React from "react"
import { Input as BaseInput } from "@base-ui/react/input"
import { Input as AriaInput } from "react-aria-components"

import { useThemeSelection } from "@/components/theme-selection"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const { base } = useThemeSelection()
  const shared = {
    type,
    "data-slot": "input",
    "data-theme-base": base,
    className: cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      ),
    ...props,
  }
  // Reference input elements: radix is a native input, base is @base-ui/react/input, aria is react-aria-components Input.
  if (base === "base") return <BaseInput {...shared} />
  if (base === "aria") return <AriaInput {...shared} />
  return <input {...shared} />
}

export { Input }
