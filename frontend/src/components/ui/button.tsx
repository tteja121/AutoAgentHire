import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#123B32] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#123B32] text-[#F7F5EF] hover:bg-[#1C5246] shadow-sm hover:shadow active:scale-[0.99]",
        coral: "bg-[#FF7058] text-white hover:bg-[#FA5D42] shadow-sm shadow-[#FF7058]/20 hover:shadow-md hover:shadow-[#FF7058]/30 active:scale-[0.99]",
        hero: "bg-[#FF7058] text-white font-medium hover:bg-[#FA5D42] shadow-md shadow-[#FF7058]/20 hover:shadow-lg hover:shadow-[#FF7058]/30 active:scale-[0.99]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        outline: "border border-[#E6E5DC] bg-white text-[#202722] hover:bg-[#FAF8F3] hover:border-[#123B32]/40 shadow-sm",
        heroOutline: "border border-[#123B32]/30 bg-transparent text-[#123B32] hover:bg-[#123B32]/5 hover:border-[#123B32]",
        secondary: "bg-[#A9BBA7] text-[#123B32] hover:bg-[#99AC97] shadow-sm",
        ghost: "hover:bg-[#FAF8F3] hover:text-[#123B32]",
        link: "text-[#123B32] underline-offset-4 hover:underline",
        glass: "bg-white/80 backdrop-blur-md border border-[#E6E5DC] text-[#202722] hover:bg-white shadow-sm",
        glow: "bg-[#FF7058] text-white hover:bg-[#FA5D42] shadow-md shadow-[#FF7058]/30",
        success: "bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-sm font-semibold",
        xl: "h-12 rounded-lg px-8 text-base font-semibold",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
