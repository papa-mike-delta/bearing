import type { Metadata } from "next";
import localFont from "next/font/local";
import { db } from "@repo/db";
import "@repo/ui/globals.css";
import "./globals.css";
import { currentSession } from "../auth";
import { defaultAccountTheme, themeCss } from "../lib/account-theme";
import { loadAccountTheme } from "../lib/account-theme-store";
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
  const session = await currentSession();
  const id = session?.user?.id;
  const account = id ? await loadAccountTheme(db, id) : defaultAccountTheme;
  const css = themeCss(account);

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
