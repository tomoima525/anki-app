"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "@/contexts/SessionContext";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, error } = useSession();

  useEffect(() => {
    // Once loading is complete and there's no user, redirect to login
    if (!isLoading && !user) {
      const loginUrl = `/login${pathname !== "/" ? `?from=${pathname}` : ""}`;
      router.push(loginUrl);
    }
  }, [isLoading, user, router, pathname]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Show children only if authenticated
  return user ? <>{children}</> : null;
}
