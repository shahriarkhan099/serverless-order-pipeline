export class MemoryQueue {
  readonly sent: { queue: string; body: string }[] = [];

  async send(queue: string, body: string) {
    this.sent.push({ queue, body });
  }
}
