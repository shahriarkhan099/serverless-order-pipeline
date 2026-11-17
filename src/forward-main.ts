import { toWorkItem } from "./application/forward.js";
import { MemoryQueue } from "./infrastructure/memory-queue.js";
import { launchIfMain } from "./runtime.js";

type Log = { log: (message: string) => void; error: (message: string) => void };

export async function forwardCommand(raw: string | undefined, queue?: MemoryQueue, write: Log = console) {
  if (!raw) {
    write.error("usage: tsx src/forward-main.ts '<order event json>'");
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    write.error("event was not forwarded");
    return 1;
  }
  const item = toWorkItem(parsed as { id?: unknown; type?: unknown; orderId?: unknown });
  if (!item) {
    write.error("event was not forwarded");
    return 1;
  }
  const target = queue ?? new MemoryQueue();
  await target.send(item.queue, item.body);
  write.log(item.queue);
  return 0;
}

export async function runForward(raw = process.argv[2]) {
  process.exitCode = await forwardCommand(raw);
}

void launchIfMain(process.argv[1], import.meta.url, runForward);
