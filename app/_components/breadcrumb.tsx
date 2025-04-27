"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { HomeIcon, ChevronRight } from "lucide-react";

export default function Breadcrumb() {
  const pathname = usePathname();

  // Skip rendering breadcrumbs on homepage
  if (pathname === "/") return null;

  // Split the pathname into segments and create breadcrumb items
  const segments = pathname.split("/").filter(Boolean);

  // Build the breadcrumb paths incrementally
  const breadcrumbs = segments.map((segment, index) => {
    const path = `/${segments.slice(0, index + 1).join("/")}`;
    return {
      name:
        segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " "),
      path,
    };
  });

  return (
    <nav className="flex items-center space-x-1 text-sm mb-4">
      <Link
        href="/"
        className="flex items-center text-muted-foreground hover:text-foreground"
      >
        <HomeIcon className="h-4 w-4" />
      </Link>

      {breadcrumbs.map((breadcrumb, index) => (
        <div key={breadcrumb.path} className="flex items-center">
          <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
          {index === breadcrumbs.length - 1 ? (
            <span className="font-medium">{breadcrumb.name}</span>
          ) : (
            <Link
              href={breadcrumb.path}
              className="text-muted-foreground hover:text-foreground"
            >
              {breadcrumb.name}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
