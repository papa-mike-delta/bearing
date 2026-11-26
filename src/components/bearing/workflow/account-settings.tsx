"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SectionCard } from "../layout";
import { fieldClass, request, useWorkspace } from "./context";

type LedgerPage = {
  entries: { id: string; operation: string; status: string; createdAt: string }[];
  page: number;
  total: number;
  limit: number;
};
type TwoFactor = { enabled: boolean; name: string | null; email: string };

export function AccountSettings() {
  const { userId } = useWorkspace();
  const [page, setPage] = useState(1);
  const profile = useQuery({
    queryKey: ["account-profile", userId],
    queryFn: async () => {
      const response = await fetch("/api/auth/2fa-status");
      const body = (await response.json()) as TwoFactor & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load the account");
      return body;
    },
  });
  const ledger = useQuery({
    queryKey: ["ledger", userId, page],
    queryFn: () => request<LedgerPage>(userId, `ledger?page=${page}&limit=10`),
  });
  if (profile.isPending || ledger.isPending)
    return <p role="status">Loading account…</p>;
  if (profile.isError || ledger.isError || !profile.data || !ledger.data)
    return <p role="alert">Could not load the account.</p>;
  return (
    <AccountForm
      userId={userId}
      profile={profile.data}
      ledger={ledger.data}
      page={page}
      onPage={setPage}
    />
  );
}

function AccountForm({
  userId,
  profile,
  ledger,
  page,
  onPage,
}: {
  userId: string;
  profile: TwoFactor;
  ledger: LedgerPage;
  page: number;
  onPage(page: number): void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(profile.name || "");
  const [email, setEmail] = useState(profile.email);
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run(action: () => Promise<string>) {
    setMessage("");
    setError("");
    try {
      setMessage(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }
  async function refresh() {
    await client.invalidateQueries({ queryKey: ["account-profile", userId] });
    await client.invalidateQueries({ queryKey: ["ledger", userId] });
  }
  return (
    <>
      <SectionCard title="Account">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const response = await fetch("/api/auth/profile", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name }),
              });
              const body = await response.json();
              if (!response.ok) throw new Error(body.error || "Could not save the name");
              await refresh();
              return "Name saved.";
            });
          }}
        >
          <label className="block text-sm">
            Display name
            <input
              aria-label="Display name"
              className={`${fieldClass} mt-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button type="submit">Save name</Button>
        </form>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await request(userId, "account/email", {
                method: "PUT",
                body: JSON.stringify({ email, password: emailPassword }),
              });
              setEmailPassword("");
              await refresh();
              return "Email saved.";
            });
          }}
        >
          <label className="block text-sm">
            Email
            <input
              aria-label="Email"
              type="email"
              required
              className={`${fieldClass} mt-1`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Password for email change
            <input
              aria-label="Password for email change"
              type="password"
              autoComplete="current-password"
              required
              className={`${fieldClass} mt-1`}
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
            />
          </label>
          <Button type="submit">Save email</Button>
        </form>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await request(userId, "account/password", {
                method: "PUT",
                body: JSON.stringify({ currentPassword, nextPassword }),
              });
              setCurrentPassword("");
              setNextPassword("");
              await refresh();
              return "Password saved.";
            });
          }}
        >
          <label className="block text-sm">
            Current password for password change
            <input
              aria-label="Current password for password change"
              type="password"
              autoComplete="current-password"
              required
              className={`${fieldClass} mt-1`}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            New password
            <input
              aria-label="New password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={`${fieldClass} mt-1`}
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
            />
          </label>
          <Button type="submit">Save password</Button>
        </form>
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            Two-factor authentication is {profile.enabled ? "on" : "off"}.
          </p>
          {profile.enabled ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void run(async () => {
                  const response = await fetch("/api/auth/disable-2fa", {
                    method: "POST",
                  });
                  const body = await response.json();
                  if (!response.ok)
                    throw new Error(body.error || "Could not disable 2FA");
                  await refresh();
                  return "Two-factor authentication disabled.";
                })
              }
            >
              Disable two-factor
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    const response = await fetch("/api/auth/setup-2fa", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: "{}",
                    });
                    const body = await response.json();
                    if (!response.ok)
                      throw new Error(body.error || "Could not start 2FA");
                    setSecret(body.secret);
                    return "Enter the code from your authenticator.";
                  })
                }
              >
                Set up two-factor
              </Button>
              {secret && (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const response = await fetch("/api/auth/setup-2fa", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "confirm", token: code }),
                      });
                      const body = await response.json();
                      if (!response.ok)
                        throw new Error(body.error || "Code did not match");
                      setSecret("");
                      setCode("");
                      await refresh();
                      return "Two-factor authentication enabled.";
                    });
                  }}
                >
                  <p className="break-all text-sm">
                    Manual key <span className="font-mono">{secret}</span>
                  </p>
                  <label className="block text-sm">
                    Authenticator code
                    <input
                      aria-label="Authenticator code"
                      inputMode="numeric"
                      required
                      className={`${fieldClass} mt-1`}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                  <Button type="submit">Confirm two-factor</Button>
                </form>
              )}
            </>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Audit receipts">
        <p className="mb-3 text-sm text-muted-foreground">
          Append-only. This list does not change or delete receipts.
        </p>
        <ul className="space-y-2 text-sm">
          {ledger.entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline gap-2">
              <a className="underline" href={`/api/receipts/${entry.id}`}>
                {entry.operation}
              </a>
              <span>{entry.status}</span>
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
          {!ledger.entries.length && <li>No receipts yet.</li>}
        </ul>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous receipts
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page * ledger.limit >= ledger.total}
            onClick={() => onPage(page + 1)}
          >
            Next receipts
          </Button>
        </div>
      </SectionCard>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
