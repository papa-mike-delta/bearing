import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, sessions, users } from "@repo/db";
import NextAuth from "next-auth";
import { redirect } from "next/navigation";
import Credentials from "next-auth/providers/credentials";
import { parseCredentials, verifyPassword } from "./lib/credentials";

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  sessionsTable: sessions,
  // Only OAuth sign-in reads accounts. Bearing has none, so there is no table.
  accountsTable: undefined as never,
});
const maxAge = 30 * 24 * 60 * 60;

// Session policy: database sessions, one row per sign-in.
// - With an adapter the strategy defaults to "database". Auth.js rejects an
//   explicit "database" with credentials only, so it is left unset. Do not set
//   strategy: "jwt" (see nextauthjs/next-auth#3729).
// - Credentials sign-in always encodes a token, so jwt.encode below stores a
//   session row and returns its id as the cookie.
// - callbacks.session only gets `user` under the database strategy.
export const { auth, signIn, signOut } = NextAuth({
  adapter,
  session: { maxAge },
  callbacks: {
    session: ({ session, user }) => {
      if (!user)
        throw new Error("Bearing expects the database session strategy");
      return {
        expires: session.expires,
        user: { id: user.id, email: user.email },
      };
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(input) {
        const credentials = parseCredentials(input);
        if (!credentials) return null;
        const user = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, credentials.email),
        });
        if (!user) return null;
        if (!(await verifyPassword(credentials.password, user.passwordHash))) {
          return null;
        }
        return { id: user.id, email: user.email };
      },
    }),
  ],
  jwt: {
    async encode({ token }) {
      if (!token?.sub) throw new Error("Sign-in produced no user id");
      const sessionToken = crypto.randomUUID();
      await adapter.createSession!({
        sessionToken,
        userId: token.sub,
        expires: new Date(Date.now() + maxAge * 1000),
      });
      return sessionToken;
    },
  },
});

// The signed-in user, or a redirect to sign in.
export async function requireUser() {
  const user = (await auth())?.user;
  if (!user?.id) redirect("/sign-in");
  return { id: user.id, email: user.email };
}
