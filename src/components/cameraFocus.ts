export interface CameraFocusTarget { lat: number; lng: number; token: number }

export class CameraFocusRequest {
  pending: CameraFocusTarget | null = null;
  private seenToken: number | undefined;

  update(target: CameraFocusTarget | null | undefined): void {
    if (!target) { this.pending = null; return; }
    if (target.token === this.seenToken) return;
    this.seenToken = target.token;
    this.pending = target;
  }

  /** Interrupted eases also emit moveend; only actual arrival consumes focus. */
  settle(center: { lat: number; lng: number }, zoom: number): void {
    const target = this.pending;
    if (target && Math.abs(center.lat - target.lat) < 0.000001 &&
      Math.abs(center.lng - target.lng) < 0.000001 && zoom >= 15.999) this.pending = null;
  }

  cancel(): void { this.pending = null; }
}
