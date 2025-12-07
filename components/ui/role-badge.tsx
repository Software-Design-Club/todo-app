import * as React from "react";
import { Badge } from "./badge";

export type UserRole = "owner" | "collaborator";

export interface RoleBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  role?: UserRole;
}

const RoleBadge = React.forwardRef<HTMLDivElement, RoleBadgeProps>(
  ({ role, className, ...props }, ref) => {
    if (role === undefined) {
      return null;
    }
    // Map role variants to Badge theme variants
    const variantMap: Record<UserRole, "primary" | "secondary"> = {
      owner: "primary",
      collaborator: "secondary",
    };

    // Map role to display text
    const textMap: Record<UserRole, string> = {
      owner: "Owner",
      collaborator: "Collaborator",
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
