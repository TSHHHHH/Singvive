import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch';

const PLAYER_SEL = '[data-hdb-player]';
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const DEFAULT_SCALE = 1;
/** Same cutoff as Tailwind `lg` / GameScreen phone shell. */
const PHONE_MQ = '(max-width: 1023px)';

function focusPlayer(api: ReactZoomPanPinchContentRef, scale?: number, ms = 280) {
  const el = document.querySelector(PLAYER_SEL);
  if (!el) return;
  api.zoomToElement(el as HTMLElement, scale ?? api.state.scale, ms);
}

const PHONE_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

/**
 * While the cutaway owns pinch, stop iOS Safari from page-zooming instead.
 * Restores the previous viewport meta on unmount.
 */
function useLockPageZoom(surface: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const prev = meta?.getAttribute('content');
    meta?.setAttribute('content', PHONE_VIEWPORT);

    const blockGesture = (e: Event) => {
      e.preventDefault();
    };
    // Safari still fires these for page pinch even with touch-action: none.
    document.addEventListener('gesturestart', blockGesture, { passive: false });
    document.addEventListener('gesturechange', blockGesture, { passive: false });
    document.addEventListener('gestureend', blockGesture, { passive: false });

    const blockMultiTouch = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      const root = surface.current;
      if (!root) return;
      const t = e.target;
      if (t instanceof Node && root.contains(t)) e.preventDefault();
    };
    document.addEventListener('touchmove', blockMultiTouch, { passive: false });

    return () => {
      if (meta && prev != null) meta.setAttribute('content', prev);
      document.removeEventListener('gesturestart', blockGesture);
      document.removeEventListener('gesturechange', blockGesture);
      document.removeEventListener('gestureend', blockGesture);
      document.removeEventListener('touchmove', blockMultiTouch);
    };
  }, [surface]);
}

/**
 * Phone-only pan/zoom shell around the HDB elevation. Desktop renders the
 * cutaway without this wrapper.
 */
export function HdbZoomViewport({
  children,
  followKey,
}: {
  children: ReactNode;
  /** Changes when the player moves — soft-pans to keep the pin on screen. */
  followKey: string;
}) {
  const apiRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const ready = useRef(false);

  useLockPageZoom(surfaceRef);

  const recenter = useCallback((scale = DEFAULT_SCALE) => {
    const api = apiRef.current;
    if (!api) return;
    focusPlayer(api, scale, 280);
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    const api = apiRef.current;
    if (!api) return;
    // Keep current zoom; just slide so the pin stays visible.
    focusPlayer(api, api.state.scale, 220);
  }, [followKey]);

  return (
    <TransformWrapper
      ref={apiRef}
      minScale={MIN_SCALE}
      maxScale={MAX_SCALE}
      initialScale={DEFAULT_SCALE}
      limitToBounds={false}
      centerOnInit={false}
      smooth
      doubleClick={{ disabled: true }}
      panning={{ velocityDisabled: true }}
      wheel={{ step: 0.12 }}
      pinch={{ step: 8 }}
      onInit={(ref) => {
        apiRef.current = ref;
        // Wait a frame so fixed-height floors have laid out.
        requestAnimationFrame(() => {
          focusPlayer(ref, DEFAULT_SCALE, 0);
          ready.current = true;
        });
      }}
    >
      {(controls) => (
        <div
          ref={surfaceRef}
          className="relative h-full min-h-0 w-full touch-none overscroll-none"
        >
          <div className="pointer-events-none absolute right-2 top-2 z-20 flex flex-col gap-1">
            <ZoomBtn
              label="+"
              title="Zoom in"
              onClick={() => controls.zoomIn(0.25, 180)}
            />
            <ZoomBtn
              label="−"
              title="Zoom out"
              onClick={() => controls.zoomOut(0.25, 180)}
            />
            <ZoomBtn label="⊙" title="Recenter on you" onClick={() => recenter()} />
          </div>
          <TransformComponent
            wrapperClass="!h-full !w-full !touch-none"
            contentClass="!inline-block"
            wrapperStyle={{ overflow: 'hidden', touchAction: 'none' }}
            contentStyle={{ touchAction: 'none' }}
          >
            {children}
          </TransformComponent>
        </div>
      )}
    </TransformWrapper>
  );
}

function ZoomBtn({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded border border-concrete-500 bg-concrete-900/90 text-sm font-bold text-concrete-100 shadow-md active:bg-concrete-800"
    >
      {label}
    </button>
  );
}

function readIsPhone(): boolean {
  if (typeof window === 'undefined') return false;
  // innerWidth catches cases where matchMedia lags behind a rotation.
  return window.matchMedia(PHONE_MQ).matches || window.innerWidth < 1024;
}

/** Tailwind `lg` breakpoint — matches GameScreen phone shell. */
export function useIsPhoneLayout(): boolean {
  const [phone, setPhone] = useState(readIsPhone);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    const sync = () => setPhone(readIsPhone());
    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return phone;
}
