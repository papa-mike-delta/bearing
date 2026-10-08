import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, sessions, users } from "@repo/db";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { parseCredentials, verifyPassword } from "./lib/credentials";

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  sessionsTable: sessions,
  // Only OAuth sign-in reads accounts. Bearing has none, so there is no table.
  accountsTable: undefined as never,
});
const maxAge = 30 * 24 * 60 * 60;

export const { auth, signIn, signOut } = NextAuth({
  adapter,
  // With an adapter the session strategy defaults to "database". Auth.js
  // rejects an explicit "database" with credentials only, so it is left unset.
  session: { maxAge },
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
    // Credentials sign-in always asks for a token. Store a session row
    // instead, so the cookie holds a database session id and not a JWT.
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
