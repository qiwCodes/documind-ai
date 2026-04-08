 "use client";

import Link from "next/link";
import { UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function PublicNavAuth() {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return <div className="h-9 w-32 animate-pulse rounded-md bg-slate-100" />;
  }

  return (
    <div className="flex items-center gap-2">
      {!userId ? (
        <>
        <Link href="/login">
          <Button variant="ghost" size="sm">
            Log in
          </Button>
        </Link>
        <Link href="/signup">
          <Button size="sm">Start Free</Button>
        </Link>
        </>
      ) : (
        <>
        <Link href="/dashboard">
          <Button variant="secondary" size="sm">
            Dashboard
          </Button>
        </Link>
        <UserButton />
        </>
      )}
    </div>
  );
}
