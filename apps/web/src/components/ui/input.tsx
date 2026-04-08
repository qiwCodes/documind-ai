import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-slate-400 focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
