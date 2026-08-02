"use client";

import OperationalShell from "@/components/operations/OperationalShell";
import TaskBoard from "@/components/operations/TaskBoard";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { hasEffectivePermission } from "@/lib/permissions";

export default function OperationsPage() {
  const { currentUser } = useCurrentUser();
  const canManage = Boolean(
    currentUser && (
      hasEffectivePermission(currentUser, "cleaning.manage") ||
      hasEffectivePermission(currentUser, "maintenance.manage")
    ),
  );

  return (
    <OperationalShell title="Операции" description="Уборка и ремонт в одном рабочем окне">
      <TaskBoard filterType="all" canManage={canManage} />
    </OperationalShell>
  );
}