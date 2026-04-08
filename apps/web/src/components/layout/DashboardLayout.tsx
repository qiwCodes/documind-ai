"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardUserActions } from "@/components/layout/DashboardUserActions";

type DashboardLayoutProps = {
  children: React.ReactNode;
  userEmail: string;
};

const links = [
  { href: "/dashboard/workspace", label: "Workspace" },
  { href: "/dashboard/library", label: "Library" },
  { href: "/dashboard/insights", label: "Insights" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardLayout({ children, userEmail }: DashboardLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 flex-col gap-4 border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/" className="mb-6 px-2 text-lg font-semibold">
          Documind AI
        </Link>
        <nav className="space-y-1">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                pathname === link.href
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <DashboardUserActions email={userEmail} />
      </aside>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
