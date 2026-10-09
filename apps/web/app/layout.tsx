import type { Metadata } from "next";
import localFont from "next/font/local";
import { eq } from "drizzle-orm";
import { db, users } from "@repo/db";
import "@repo/ui/globals.css";
import "./globals.css";
import { auth } from "../auth";
import { themeCss } from "../lib/account-theme";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Bearing",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const id = session?.user?.id;
  const row = id
    ? await db.query.users.findFirst({
        where: eq(users.id, id),
        columns: {
          themeChoice: true,
          themeCode: true,
          themeLight: true,
          themeDark: true,
        },
      })
    : null;
  const css = row
    ? themeCss({
        choice: row.themeChoice,
        code: row.themeCode,
        light: row.themeLight,
        dark: row.themeDark,
      })
    : null;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
