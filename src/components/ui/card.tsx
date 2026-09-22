import { clsx } from "clsx";
import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "sm" | "md" | "lg";
}

export function Card({ className, padding = "md", children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "bg-white rounded-xl border border-gray-200 shadow-sm",
        {
          "p-3": padding === "sm",
          "p-4": padding === "md",
          "p-6": padding === "lg",
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
