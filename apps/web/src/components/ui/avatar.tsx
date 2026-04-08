import * as React from "react";
import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100",
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({ className, alt = "", ...props }: React.ComponentProps<"img">) {
  // Avatar supports arbitrary image URLs and may be external/user-provided.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} className={cn("aspect-square h-full w-full", className)} {...props} />;
}

function AvatarFallback({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("flex h-full w-full items-center justify-center text-xs font-medium", className)}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
