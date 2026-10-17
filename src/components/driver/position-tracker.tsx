"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The driver's position tracker.
 *
 * This is the last mile of driver tracking: the phone in the vehicle shares
 * where the bus is, so the dispatcher sees it on the map. It has to survive
 * the reality of a vehicle — no signal in a tunnel, a phone that dies, a
 * driver who closes the screen — so:
 *
 *   - every fix is queued on the device first (localStorage), never lost;
 *   - the queue is replayed to the server when the connection returns;
 *   - every item carries a `clientRef`, so a replay that the server already
 *     accepted is ignored rather than duplicated;
 *   - the server checks that the trip is assigned to the driver before it
 *     stores anything.
 *
 * The status is an external store rather than component state, because the
 * watcher, the network listener and the button all write to it.
 */

const QUEUE_KEY = "rts-driver-queue";
const SYNC_URL = "/api/driver/sync";

type QueuedFix = {
  kind: "position";
  tripId: number;
  lat: number;
  lng: number;
  speedKph: number;
  heading: number;
  clientRef: string;
  recordedAt: string;
};

type TrackerState = {
  /** What the device is doing right now. */
  mode: "starting" | "sharing" | "paused" | "denied" | "unsupported" | "error";
  /** Fixes waiting for the network. */
  queued: number;
  /** When the last fix reached the server. */
  lastSentAt: string | null;
  /** The last thing that went wrong, in words the driver can act on. */
  message: string | null;
  /** Whether the driver has switched sharing on. */
  enabled: boolean;
};

const initialState: TrackerState = {
  mode: "starting",
  queued: 0,
  lastSentAt: null,
  message: null,
  enabled: false,
};

let state: TrackerState = initialState;
const listeners = new Set<() => void>();

function setState(patch: Partial<TrackerState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TrackerState {
  return state;
}

function getServerSnapshot(): TrackerState {
  return initialState;
}

/* ------------------------------------------------------------- the queue */

function readQueue(): QueuedFix[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedFix[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedFix[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-500)));
  } catch {
    // Storage is full or blocked — the fix is still in memory.
  }
  setState({ queued: items.length });
}

function enqueue(fix: QueuedFix) {
  const items = readQueue();
  items.push(fix);
  writeQueue(items);
  void flush();
}

let flushing = false;

/** Send the queue to the server and drop what it accepted. */
async function flush(): Promise<void> {
  if (flushing) return;
  const items = readQueue();
  if (!items.length) return;
  flushing = true;
  try {
    const response = await fetch(SYNC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) {
      setState({ mode: state.enabled ? "sharing" : "paused", message: "Waiting for the network." });
      return;
    }
    const payload = (await response.json()) as {
      results?: Array<{ clientRef?: string; ok: boolean; message?: string }>;
    };
    const accepted = new Set(
      (payload.results ?? []).filter((r) => r.ok && r.clientRef).map((r) => r.clientRef as string),
    );
    const remaining = items.filter((item) => !accepted.has(item.clientRef));
    writeQueue(remaining);
    setState({
      lastSentAt: new Date().toISOString(),
      message: remaining.length ? "Some fixes were refused — check the trip." : null,
    });
  } catch {
    setState({
      mode: state.enabled ? "sharing" : "paused",
      message: "No connection — the fixes are held on the phone.",
    });
  } finally {
    flushing = false;
  }
}

/* ------------------------------------------------------------ the tracker */

export function PositionTracker({
  tripId,
  active = true,
}: {
  tripId: number;
  /** Only track while the trip is actually running. */
  active?: boolean;
}) {
  const watchId = useRef<number | null>(null);
  const enabledRef = useRef(false);

  const stop = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    enabledRef.current = false;
    setState({ mode: "paused", message: null });
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ mode: "unsupported", message: "This device has no location service." });
      return;
    }
    enabledRef.current = true;
    setState({ mode: "starting", enabled: true, message: null });
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        enqueue({
          kind: "position",
          tripId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speedKph: Math.round(position.coords.speed ?? 0),
          heading: Math.round(position.coords.heading ?? 0),
          clientRef:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          recordedAt: new Date().toISOString(),
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          enabledRef.current = false;
          setState({
            mode: "denied",
            enabled: false,
            message: "Location permission was refused. Allow it in the browser settings, or type a position below.",
          });
          return;
        }
        setState({ mode: "error", message: "The location service is not answering." });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [tripId]);

  // Start the watcher when the trip is running, stop it when it is not.
  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    start();
    return stop;
  }, [active, start, stop]);

  // Replay the queue when the network comes back, and on a slow timer so a
  // dropped connection is not the end of the trail.
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => {
      if (readQueue().length) void flush();
    }, 30000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const status = (() => {
    if (snapshot.mode === "unsupported") return { tone: "idle" as const, label: "No location service" };
    if (snapshot.mode === "denied") return { tone: "critical" as const, label: "Permission refused" };
    if (snapshot.mode === "error") return { tone: "critical" as const, label: "Location error" };
    if (snapshot.queued > 0) return { tone: "caution" as const, label: `${snapshot.queued} waiting` };
    if (snapshot.mode === "sharing") return { tone: "live" as const, label: "Sharing" };
    if (snapshot.mode === "paused") return { tone: "idle" as const, label: "Paused" };
    return { tone: "scheduled" as const, label: "Starting" };
  })();

  return (
    <div className="rounded-[8px] border border-line bg-surface-1 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusChip tone={status.tone} label={status.label} />
          <span className="text-[12px] text-ink-3">
            {snapshot.lastSentAt
              ? `Last fix sent ${new Date(snapshot.lastSentAt).toLocaleTimeString()}`
              : "No fix sent yet"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={start} disabled={snapshot.mode === "sharing"}>
            Start sharing
          </Button>
          <Button size="sm" variant="ghost" onClick={stop} disabled={snapshot.mode === "paused"}>
            Stop
          </Button>
        </div>
      </div>

      {snapshot.message ? (
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-2">{snapshot.message}</p>
      ) : (
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
          The office sees this vehicle on the map. Fixes are held on the phone when there is no
          signal and sent when it returns.
        </p>
      )}

      {snapshot.queued > 0 ? (
        <p className={cn("mt-2 text-[11.5px] text-ink-3")}>
          {snapshot.queued} fix{snapshot.queued === 1 ? "" : "es"} waiting to be sent.
        </p>
      ) : null}
    </div>
  );
}
