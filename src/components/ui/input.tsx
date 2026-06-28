import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full bg-green-950/30 border border-green-500 text-green-500 placeholder:text-green-500/60 rounded-none shadow-[inset_0_0_10px_rgba(34,197,94,0.15)] focus-visible:ring-1 focus-visible:ring-green-500 focus-visible:outline-none font-mono text-sm tracking-widest px-4 uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
