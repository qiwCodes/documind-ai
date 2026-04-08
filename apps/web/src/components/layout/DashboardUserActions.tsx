"use client";

import { UserButton } from "@clerk/nextjs";

type DashboardUserActionsProps = {
  email: string;
};

export function DashboardUserActions({ email }: DashboardUserActionsProps) {
  return (
    <div className="mt-auto space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="truncate text-xs text-slate-500">{email}</p>
      <div className="flex justify-end">
        <UserButton />
      </div>
    </div>
  );
}
