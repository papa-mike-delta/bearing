"use client"

import * as React from "react"
import { Select as BaseSelect } from "@base-ui/react/select"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Button as AriaButton, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue as AriaSelectValue } from "react-aria-components"

import { Icon } from "@/components/bearing/icon"
import { useThemeSelection } from "@/components/theme-selection"
import { cn } from "@/lib/utils"

function Select({
  value,
  defaultValue,
  onValueChange,
  disabled,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const { base } = useThemeSelection()
  if (base === "base") {
    return (
      <BaseSelect.Root
        data-slot="select"
        data-theme-base="base"
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onValueChange={(next) => onValueChange?.(next == null ? "" : String(next))}
        {...props}
      >
        {children}
      </BaseSelect.Root>
    )
  }
  if (base === "aria") {
    return (
      <AriaSelect
        data-slot="select"
        data-theme-base="aria"
        selectedKey={value}
        defaultSelectedKey={defaultValue}
        isDisabled={disabled}
        onSelectionChange={(key) => onValueChange?.(key == null ? "" : String(key))}
        className="grid gap-1"
      >
        {children}
      </AriaSelect>
    )
  }
  return (
    <SelectPrimitive.Root data-slot="select" data-theme-base="radix" value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled} {...props}>
      {children}
    </SelectPrimitive.Root>
  )
}

function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  const { base } = useThemeSelection()
  if (base === "base") return <BaseSelect.Group data-slot="select-group" {...props} />
  if (base === "aria") return <div data-slot="select-group" {...props} />
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({ placeholder, ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  const { base } = useThemeSelection()
  if (base === "base") return <BaseSelect.Value data-slot="select-value" placeholder={placeholder} {...props} />
  if (base === "aria") {
    return (
      <AriaSelectValue data-slot="select-value" {...props}>
        {({ isPlaceholder, selectedText, defaultChildren }) => (isPlaceholder ? placeholder ?? defaultChildren : selectedText || defaultChildren)}
      </AriaSelectValue>
    )
  }
  return <SelectPrimitive.Value data-slot="select-value" placeholder={placeholder} {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  const { base } = useThemeSelection()
  const classes = cn(
    "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex min-w-0 max-w-full w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    className
  )
  const chevron = <Icon name="ChevronDown" className="size-4 opacity-50" />
  if (base === "base") {
    return (
      <BaseSelect.Trigger data-slot="select-trigger" data-size={size} className={classes} {...props}>
        {children}
        <BaseSelect.Icon render={chevron} />
      </BaseSelect.Trigger>
    )
  }
  if (base === "aria") {
    return (
      <AriaButton data-slot="select-trigger" data-size={size} className={classes}>
        {children}
        {chevron}
      </AriaButton>
    )
  }
  return (
    <SelectPrimitive.Trigger data-slot="select-trigger" data-size={size} className={classes} {...props}>
      {children}
      <SelectPrimitive.Icon asChild>{chevron}</SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const { base } = useThemeSelection()
  const classes = cn(
    "bg-popover text-popover-foreground relative z-50 max-h-60 min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
    className
  )
  if (base === "base") {
    return (
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="isolate z-50">
          <BaseSelect.Popup data-slot="select-content" data-theme-base="base" className={classes}>
            <BaseSelect.List>{children}</BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    )
  }
  if (base === "aria") {
    return (
      <Popover data-slot="select-content" data-theme-base="aria" className={classes} offset={4}>
        <ListBox className="p-1 outline-none">{children}</ListBox>
      </Popover>
    )
  }
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content data-slot="select-content" data-theme-base="radix" className={cn(classes, position === "popper" && "data-[side=bottom]:translate-y-1")} position={position} {...props}>
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className={cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1")}>
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel(props: React.ComponentProps<typeof SelectPrimitive.Label>) {
  const { base } = useThemeSelection()
  const className = cn("text-muted-foreground px-2 py-1.5 text-xs", props.className)
  if (base === "base") return <BaseSelect.GroupLabel data-slot="select-label" className={className} {...props} />
  if (base === "aria") return <div data-slot="select-label" className={className} {...props} />
  return <SelectPrimitive.Label data-slot="select-label" className={className} {...props} />
}

function SelectItem({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const { base } = useThemeSelection()
  const classes = cn(
    "focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    className
  )
  const mark = <Icon name="Check" className="size-4" />
  if (base === "base") {
    return (
      <BaseSelect.Item data-slot="select-item" className={classes} value={value} {...props}>
        <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
        <BaseSelect.ItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center">{mark}</BaseSelect.ItemIndicator>
      </BaseSelect.Item>
    )
  }
  if (base === "aria") {
    return (
      <ListBoxItem id={value} data-slot="select-item" className={classes} textValue={typeof children === "string" ? children : undefined}>
        {({ isSelected }) => (
          <>
            <span className="min-w-0 flex-1">{children}</span>
            {isSelected ? <span className="absolute right-2">{mark}</span> : null}
          </>
        )}
      </ListBoxItem>
    )
  }
  return (
    <SelectPrimitive.Item data-slot="select-item" className={classes} value={value} {...props}>
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>{mark}</SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator(props: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  const { base } = useThemeSelection()
  const className = cn("bg-border pointer-events-none -mx-1 my-1 h-px", props.className)
  if (base === "base") return <BaseSelect.Separator data-slot="select-separator" className={className} />
  if (base === "aria") return <div data-slot="select-separator" className={className} />
  return <SelectPrimitive.Separator data-slot="select-separator" className={className} {...props} />
}

function SelectScrollUpButton(props: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  const { base } = useThemeSelection()
  if (base !== "radix") return null
  return (
    <SelectPrimitive.ScrollUpButton data-slot="select-scroll-up-button" className={cn("flex cursor-default items-center justify-center py-1", props.className)} {...props}>
      <Icon name="ChevronDown" className="size-4 rotate-180" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton(props: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  const { base } = useThemeSelection()
  if (base !== "radix") return null
  return (
    <SelectPrimitive.ScrollDownButton data-slot="select-scroll-down-button" className={cn("flex cursor-default items-center justify-center py-1", props.className)} {...props}>
      <Icon name="ChevronDown" className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
