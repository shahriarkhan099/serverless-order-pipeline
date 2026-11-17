import { toWorkItem } from "./application/forward.js";
import { MemoryQueue } from "./infrastructure/memory-queue.js";

const raw = process.argv[2];
if (!raw) {
  console.error("usage: tsx src/forward-main.ts '<order event json>'");
  process.exitCode = 1;
} else {
  const item = toWorkItem(JSON.parse(raw) as { id?: unknown; type?: unknown; orderId?: unknown });
  if (!item) {
    console.error("event was not forwarded");
    process.exitCode = 1;
  } else {
    const queue = new MemoryQueue();
    await queue.send(item.queue, item.body);
    console.log(item.queue);
  }
}
