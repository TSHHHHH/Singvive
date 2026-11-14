import { describe, expect, it } from 'vitest';
import { CameraFocusRequest } from './cameraFocus';

const target = { lat: 1.32, lng: 103.82, token: 1 };

describe('pending map focus', () => {
  it('retains a request when a padding or resize movement ends before arrival', () => {
    const focus = new CameraFocusRequest();
    focus.update(target);
    focus.settle({ lat: 1.3, lng: 103.8 }, 14);
    expect(focus.pending).toEqual(target);
    focus.settle(target, 15);
    expect(focus.pending).toEqual(target);
    focus.settle(target, 16);
    expect(focus.pending).toBeNull();
  });

  it('does not replay completed focus on later layout changes', () => {
    const focus = new CameraFocusRequest();
    focus.update(target);
    focus.settle(target, 16);
    focus.update({ ...target });
    expect(focus.pending).toBeNull();
    focus.update({ ...target, token: 2 });
    expect(focus.pending?.token).toBe(2);
  });

  it('lets a user gesture cancel focus through subsequent layout changes', () => {
    const focus = new CameraFocusRequest();
    focus.update(target);
    focus.cancel();
    focus.update(target);
    expect(focus.pending).toBeNull();
  });
});
