import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ItemDraftSession } from "@/components/bearing/item-draft-session";
import { V1Scope } from "@/components/bearing/workflow/v1-scope";
/** The existing draft owner lives at the signed-in layout, not at a changing view. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = verifySession(
    (await cookies()).get(SESSION_COOKIE)?.value ?? "",
  );
  if (!session?.twoFactorVerified) redirect("/login");
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: "document.documentElement.classList.add('bearing-v1')",
        }}
      />
      <V1Scope />
      <ItemDraftSession key={session.userId} userId={session.userId}>
        {children}
      </ItemDraftSession>
    </>
  );
}
