import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
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

function focusPlayer(api: ReactZoomPanPinchContentRef, scale?: number, ms = 280) {
  const el = document.querySelector(PLAYER_SEL);
  if (!el) return;
  api.zoomToElement(el as HTMLElement, scale ?? api.state.scale, ms);
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
  const ready = useRef(false);

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
        <div className="relative h-full min-h-0 w-full">
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
            wrapperClass="!h-full !w-full"
            contentClass="!inline-block"
            wrapperStyle={{ overflow: 'hidden' }}
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

/** Tailwind `lg` breakpoint — matches GameScreen phone shell. */
export function useIsPhoneLayout(): boolean {
  const [phone, setPhone] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 1023px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return phone;
}
