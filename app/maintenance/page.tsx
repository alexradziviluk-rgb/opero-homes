"use client";

import OperationalShell from "@/components/operations/OperationalShell";
import TaskBoard from "@/components/operations/TaskBoard";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { hasEffectivePermission } from "@/lib/permissions";

export default function MaintenancePage() {
  const { currentUser } = useCurrentUser();
  const canManage = Boolean(currentUser && hasEffectivePermission(currentUser, "maintenance.manage"));

  return (
    <OperationalShell title="Ремонты" description="Заявки на ремонт, исполнители и контроль выполнения">
      <TaskBoard filterType="technical" canManage={canManage} />
    </OperationalShell>
  );
}
