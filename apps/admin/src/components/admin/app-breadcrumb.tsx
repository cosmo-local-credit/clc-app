import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export type BreadcrumbCrumb = {
  label: ReactNode;
  /** When omitted, the crumb is the current page (non-link). */
  to?: string;
  params?: Record<string, string | number>;
  search?: Record<string, unknown>;
  className?: string;
};

/**
 * Shared shadcn breadcrumb trail wired to TanStack Router Links.
 * Last crumb is always the current page (aria-current).
 */
export function AppBreadcrumb({
  items,
  className,
}: {
  items: Array<BreadcrumbCrumb>;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            // The separator is a sibling of the item, not a child: both render an
            // <li>, and nesting them puts an <li> inside an <li> — invalid HTML,
            // and React reports it as a hydration error.
            <Fragment key={index}>
              <BreadcrumbItem>
                {isLast || !item.to ? (
                  <BreadcrumbPage className={cn(item.className)}>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={
                      <Link
                        to={item.to}
                        params={item.params as never}
                        search={item.search as never}
                      />
                    }
                    className={item.className}
                  >
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast ? <BreadcrumbSeparator /> : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
