export type EffectClaim = {
  claim(eventId: string): Promise<boolean>;
  release(eventId: string): Promise<void>;
};

export class MemoryEffects implements EffectClaim {
  private readonly held = new Set<string>();

  async claim(eventId: string) {
    if (this.held.has(eventId)) return false;
    this.held.add(eventId);
    return true;
  }

  async release(eventId: string) {
    this.held.delete(eventId);
  }
}
