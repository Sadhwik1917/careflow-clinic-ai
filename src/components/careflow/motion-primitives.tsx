import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { motion, useReducedMotion, type MotionProps } from "motion/react";
import { DialogPortal, DialogOverlay, DialogClose, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export { DialogTitle, DialogDescription };

export function MotionReveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.div initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.16 }} className={className}>{children}</motion.div>;
}

const MotionContent = motion.create(DialogPrimitive.Content);
// Radix owns presence, focus trapping/restoration, Escape, outside click, and accessible naming.
// A short exit keeps the focus trap intact until Radix unmounts the dialog.
export const MotionDialogContent = forwardRef<HTMLDivElement, Omit<ComponentProps<typeof DialogPrimitive.Content>, keyof MotionProps> & { children?: ReactNode }>(({ children, className, ...props }, ref) => {
  const reduced = useReducedMotion();
  return <DialogPortal><DialogOverlay className="bg-foreground/40 backdrop-blur-[2px] motion-reduce:animate-none" />
    <MotionContent ref={ref} {...props} initial={reduced ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? 0 : 0.16 }}
      className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-popover text-popover-foreground p-5 shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none sm:p-6", className)}>
      {children}<DialogClose asChild><Button size="icon" variant="ghost" className="absolute right-3 top-3" aria-label="Close"><X /></Button></DialogClose>
    </MotionContent>
  </DialogPortal>;
});
MotionDialogContent.displayName = "MotionDialogContent";