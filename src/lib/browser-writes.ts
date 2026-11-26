export type WriteSource = "user";
export type WriteFailure = {
  source: WriteSource;
  status?: number;
  receiptId?: string;
  kind:
    | "conflict"
    | "error"
    | "malformed"
    | "rate-limit"
    | "item-open"
    | "network";
  message: string;
  currentRevision?: number | null;
  limit?: number;
  itemId?: string;
  error?: string;
};

/** Typed refusal shared by the V1 workspace client and the draft owner. */
export class BrowserWriteError extends Error {
  readonly status?: number;
  readonly receiptId?: string;
  constructor(readonly outcome: WriteFailure) {
    super(outcome.message);
    this.name = "BrowserWriteError";
    this.status = outcome.status;
    this.receiptId = outcome.receiptId;
  }
}

export function operationReceiptHref(id: string, _source: WriteSource = "user") {
  return `/api/receipts/${encodeURIComponent(id)}`;
}
