import * as React from "react";
import { Badge } from "./badge";
import { type UserRole, type DisplayUserRole } from "@/lib/types";

export type { UserRole, DisplayUserRole };

export interface RoleBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  role?: DisplayUserRole;
}

const RoleBadge = React.forwardRef<HTMLDivElement, RoleBadgeProps>(
  ({ role, className, ...props }, ref) => {
    if (role === undefined) {
      return null;
    }
    // Map role variants to Badge theme variants
    const variantMap: Record<DisplayUserRole, "primary" | "secondary" | "default"> = {
      owner: "primary",
      collaborator: "secondary",
      viewer: "default",
    };

    // Map role to display text
    const textMap: Record<DisplayUserRole, string> = {
      owner: "Owner",
      collaborator: "Collaborator",
      viewer: "Viewer",
    };

    const badgeVariant = variantMap[role];
    const badgeText = textMap[role];

    return (
      <Badge ref={ref} variant={badgeVariant} className={className} {...props}>
        {badgeText}
      </Badge>
    );
  }
);
RoleBadge.displayName = "RoleBadge";

export { RoleBadge };
