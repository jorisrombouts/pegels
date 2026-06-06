import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex select-none touch-manipulation items-center justify-center gap-2 rounded-full text-sm font-semibold outline-none transition-[transform,background-color,color] duration-150 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        glass: "glass text-foreground hover:bg-[hsl(var(--muted)/0.6)]",
        ghost: "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--muted)/0.5)]",
        danger: "text-negative hover:bg-[hsl(var(--negative)/0.12)]",
      },
      size: {
        sm: "h-9 px-3.5",
        md: "h-11 px-5",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(button({ variant, size }), className)} {...props} />;
}
