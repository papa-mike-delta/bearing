import * as store from "../../../public/bearing-outbox.js";
import type { CaptureInput } from "./workflow-contracts";
export type Identity = {
  userId: string;
  email: string;
  expiresAt: number;
  timezone?: string;
};
export type OutboxEntry = CaptureInput & {
  userId: string;
  status: "pending" | "synced" | "error";
  error: string | null;
  attempts: number;
  serverId?: string;
};
export const outbox = store as unknown as {
  activeAccount(): Promise<Identity | null>;
  activateAccount(identity: Identity): Promise<void>;
  lockAccount(): Promise<void>;
  listEntries(userId: string): Promise<OutboxEntry[]>;
  enqueue(userId: string, value: CaptureInput): Promise<OutboxEntry>;
  syncOutbox(
    userId: string,
    options?: { retryErrors?: boolean },
  ): Promise<{
    synced: number;
    locked?: boolean;
    offline?: boolean;
    unavailable?: boolean;
    busy?: boolean;
  }>;
  channelName: string;
};
