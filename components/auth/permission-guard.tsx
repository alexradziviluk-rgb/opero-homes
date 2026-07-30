"use client";

import { useMemo } from "react";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { UserRole } from "@/types/user";

type PermissionGuardProps = {
  role: UserRole;
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function PermissionGuard({ role, permission, children, fallback = null }: PermissionGuardProps) {
  const allowed = useMemo(() => hasPermission(role, permission), [permission, role]);

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
