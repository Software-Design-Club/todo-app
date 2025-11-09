import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-3 py-1 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
        primary:
          "bg-blue-500 text-white dark:bg-blue-600 dark:text-white",
        secondary:
          "bg-gray-300 text-gray-800 dark:bg-gray-600 dark:text-gray-100",
        success:
          "bg-green-500 text-white dark:bg-green-600 dark:text-white",
        destructive:
          "bg-red-500 text-white dark:bg-red-600 dark:text-white",
      },
      size: {
        default: "text-xs md:text-sm",
        sm: "text-xs px-2 py-0.5",
        lg: "text-sm md:text-base px-3 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge, badgeVariants }
