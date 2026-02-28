import * as React from "react";
import { Badge } from "./badge";
import { type DisplayUserRole } from "@/lib/types";

export interface RoleBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  role?: DisplayUserRole;
}

const RoleBadge = React.forwardRef<HTMLDivElement, RoleBadgeProps>(
  ({ role, className, ...props }, ref) => {
    if (role === undefined) {
      return null;
    }

    const badgeVariant =
      role === "owner" ? "primary" :
      role === "collaborator" ? "secondary" : "default";

    const badgeText =
      role === "owner" ? "Owner" :
      role === "collaborator" ? "Collaborator" : "Viewer";

    return (
      <Badge ref={ref} variant={badgeVariant} className={className} {...props}>
        {badgeText}
      </Badge>
    );
  }
);
RoleBadge.displayName = "RoleBadge";

export { RoleBadge };
