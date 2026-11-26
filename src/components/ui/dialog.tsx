"use client"

import * as React from "react"
import { Dialog as BaseDialog } from "@base-ui/react/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components"

import { Icon } from "@/components/bearing/icon"
import { useThemeSelection } from "@/components/theme-selection"
import { cn } from "@/lib/utils"

const AriaDialogContext = React.createContext<{
  open?: boolean
  onOpenChange?: (open: boolean) => void
} | null>(null)

function Dialog({
  open,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const { base } = useThemeSelection()
  if (base === "aria") {
    return <AriaDialogContext.Provider value={{ open, onOpenChange }}>{children}</AriaDialogContext.Provider>
  }
  if (base === "base") {
    return <BaseDialog.Root data-slot="dialog" data-theme-base={base} open={open} onOpenChange={onOpenChange} {...props}>{children}</BaseDialog.Root>
  }
  return <DialogPrimitive.Root data-slot="dialog" data-theme-base={base} open={open} onOpenChange={onOpenChange} {...props}>{children}</DialogPrimitive.Root>
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  const { base } = useThemeSelection()
  if (base === "aria") return <AriaDialogTrigger data-slot="dialog-trigger" {...(props as React.ComponentProps<typeof AriaDialogTrigger>)} />
  if (base === "base") return <BaseDialog.Trigger data-slot="dialog-trigger" {...props} />
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const { base } = useThemeSelection()
  if (base === "base") return <BaseDialog.Portal data-slot="dialog-portal">{props.children}</BaseDialog.Portal>
  if (base === "aria") return <>{props.children}</>
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const { base } = useThemeSelection()
  if (base === "base") return <BaseDialog.Close data-slot="dialog-close" {...props} />
  if (base === "aria") return <AriaButton slot="close" data-slot="dialog-close" {...(props as React.ComponentProps<typeof AriaButton>)} />
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const { base } = useThemeSelection()
  const classes = cn(
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
    className
  )
  if (base === "base") return <BaseDialog.Backdrop data-slot="dialog-overlay" className={classes} {...props} />
  if (base === "aria") return null
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={classes} {...props} />
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const { base } = useThemeSelection()
  const aria = React.useContext(AriaDialogContext)
  const classes = cn(
    "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[calc(100dvh-2rem)] overflow-y-auto fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
    className
  )
  if (base === "aria") {
    return (
      <ModalOverlay isOpen={aria?.open} onOpenChange={aria?.onOpenChange} isDismissable className="fixed inset-0 z-50 bg-black/50">
        <Modal data-slot="dialog-content" data-theme-base="aria" className={classes} {...props}>
          <AriaDialog className="grid gap-4 outline-none">
            {children}
            {showCloseButton && (
              <AriaButton slot="close" data-slot="dialog-close" className="touch-target inline-flex items-center justify-center absolute top-4 right-4 rounded-xs opacity-70">
                <Icon name="X" />
                <span className="sr-only">Close</span>
              </AriaButton>
            )}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    )
  }
  if (base === "base") {
    return (
      <BaseDialog.Portal>
        <BaseDialog.Backdrop data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-black/50" />
        <BaseDialog.Popup data-slot="dialog-content" data-theme-base="base" className={classes} {...props}>
          {children}
          {showCloseButton && (
            <BaseDialog.Close data-slot="dialog-close" className="touch-target inline-flex items-center justify-center absolute top-4 right-4 rounded-xs opacity-70">
              <Icon name="X" />
              <span className="sr-only">Close</span>
            </BaseDialog.Close>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    )
  }
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content data-slot="dialog-content" data-theme-base="radix" className={classes} {...props}>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" className="touch-target inline-flex items-center justify-center ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <Icon name="X" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex min-w-0 flex-col gap-2 pr-10 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const { base } = useThemeSelection()
  const classes = cn("text-lg leading-none font-semibold", className)
  if (base === "aria") return <Heading slot="title" data-slot="dialog-title" className={classes} {...props} />
  if (base === "base") return <BaseDialog.Title data-slot="dialog-title" className={classes} {...props} />
  return <DialogPrimitive.Title data-slot="dialog-title" className={classes} {...props} />
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const { base } = useThemeSelection()
  const classes = cn("text-muted-foreground text-sm", className)
  if (base === "aria") return <p data-slot="dialog-description" className={classes} {...props} />
  if (base === "base") return <BaseDialog.Description data-slot="dialog-description" className={classes} {...props} />
  return <DialogPrimitive.Description data-slot="dialog-description" className={classes} {...props} />
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
