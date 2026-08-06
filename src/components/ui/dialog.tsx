"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Glass dialog with a springy entrance. Centered on desktop, a bottom sheet on
 * mobile (PRD: modal on desktop, bottom sheet on mobile). Centering is done via
 * flex so Motion is free to animate the panel's transform.
 */
export function DialogContent({ className, children, title, description, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className="fixed inset-0 z-50 flex items-end justify-center outline-none sm:items-center"
        // Radix wants a Description or an explicit opt-out; without `description` we opt out.
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring}
          className={cn(
            "glass pointer-events-auto max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl p-6",
            "sm:max-w-md sm:rounded-3xl",
            className,
          )}
        >
          <div className="mb-5 flex items-center justify-between">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--muted)/0.6)] hover:text-foreground">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {description && (
            <DialogPrimitive.Description className="-mt-3 mb-4 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
          )}
          {children}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
