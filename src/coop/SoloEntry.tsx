import App from '../App';
import { ErrorBoundary } from '../components/ErrorBoundary';

/** Loaded only by the solo entry, preserving its save lock and error recovery. */
export default function SoloEntry() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}
