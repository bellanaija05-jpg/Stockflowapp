import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 proxy (previously called middleware). Runs on every request
 * before pages render: refreshes the auth session and enforces
 * public/protected routes.
 */
export async function proxy(
  request: Parameters<typeof updateSession>[0]
) {
  return await updateSession(request);
}

export const config = {
  // Run on everything except static files and images.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
