import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useOpenItem } from "./use-open-item";

const { effect } = vi.hoisted(() => ({ effect: vi.fn() }));
vi.mock("react", () => ({ useEffect: effect }));
const fetchMock = vi.fn();
const account = "user-1";

function mount(id: string | null, user: string | null = account) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- useEffect is mocked to exercise the real setup/cleanup callbacks.
  useOpenItem(id, user ?? undefined);
  return effect.mock.calls.at(-1)![0]() as (() => void) | undefined;
}
const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
const opens = () => bodies().map((body) => body.open);
const tokens = () => bodies().map((body) => body.token);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response("{}"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("refreshes at 30 seconds and serializes cleanup after a delayed refresh", async () => {
  let release!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
  const close = mount("Item / with spaces")!;
  expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/items/Item%20%2F%20with%20spaces/lease");
  expect(fetchMock.mock.calls[0][1].headers["X-Bearing-Account"]).toBe(account);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(opens()).toEqual([true]);
  await vi.advanceTimersByTimeAsync(1);
  close();
  expect(opens()).toEqual([true]);
  release(new Response("{}"));
  await vi.runAllTimersAsync();
  expect(opens()).toEqual([true, true, false]);
  expect(new Set(tokens()).size).toBe(1);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(opens()).toEqual([true, true, false]);
});

it("gives an effect replay/remount an independent lease while old cleanup waits", async () => {
  let release!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
  const closeOld = mount("item")!;
  closeOld();
  const closeNew = mount("item")!;
  const [oldToken, newToken] = tokens();
  expect(oldToken).not.toBe(newToken);
  release(new Response("{}"));
  await vi.advanceTimersByTimeAsync(0);
  expect(opens()).toEqual([true, true, false]);
  expect(tokens()[2]).toBe(oldToken);
  closeNew();
  await vi.runAllTimersAsync();
  expect(opens()).toEqual([true, true, false, false]);
  expect(tokens()[3]).toBe(newToken);
});

it("still closes after a rejected request and does nothing without an Item or account", async () => {
  expect(mount(null)).toBeUndefined();
  expect(mount("item", null)).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockRejectedValueOnce(new Error("network unavailable"));
  mount("item")!();
  await vi.runAllTimersAsync();
  expect(opens()).toEqual([true, false]);
  expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/v1/items/"))).toBe(true);
});
