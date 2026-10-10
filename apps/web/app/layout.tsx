import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { db } from "@repo/db";
import "@repo/ui/globals.css";
import "./globals.css";
import { currentSession } from "../auth";
import { defaultAccountTheme, themeCss } from "../lib/account-theme";
import { loadAccountTheme } from "../lib/account-theme-store";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Bearing",
  description: "Tasks, inbox, and a coach that keep you on course.",
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
      className={`${inter.variable} ${geistMono.variable} bg-background antialiased`}
    >
      <body>
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
