"use client";

import OperationalShell from "@/components/operations/OperationalShell";
import TaskBoard from "@/components/operations/TaskBoard";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { hasEffectivePermission } from "@/lib/permissions";

export default function TasksPage() {
  const { currentUser } = useCurrentUser();
  const canManage = Boolean(currentUser && hasEffectivePermission(currentUser, "tasks.manage"));

  return (
    <OperationalShell title="Задачи" description="Все операционные задачи организации">
      <TaskBoard canManage={canManage} />
    </OperationalShell>
  );
}
