"use client";

import OperationalShell from "@/components/operations/OperationalShell";
import TaskBoard from "@/components/operations/TaskBoard";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { hasEffectivePermission } from "@/lib/permissions";

export default function CleaningPage() {
  const { currentUser } = useCurrentUser();
  const canManage = Boolean(currentUser && hasEffectivePermission(currentUser, "cleaning.manage"));

  return (
    <OperationalShell title="Уборки" description="Назначение, контроль выполнения и проверка уборок">
      <TaskBoard filterType="cleaning" canManage={canManage} />
    </OperationalShell>
  );
}
