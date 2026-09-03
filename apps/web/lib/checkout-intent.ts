export class CheckoutSubmitIntent {
  private signature: string | null = null;
  private key: string | null = null;

  constructor(private readonly createKey: () => string = () => crypto.randomUUID()) {}

  keyFor(signature: string): string {
    if (!this.key || this.signature !== signature) {
      this.key = this.createKey();
      this.signature = signature;
    }
    return this.key;
  }

  rotate(): void {
    this.key = null;
  }

  clear(): void {
    this.key = null;
    this.signature = null;
  }
}
