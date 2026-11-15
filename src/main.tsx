import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { useT } from './i18n/useT'
import './index.css'

// A co-op tab must never evaluate App: its module tree claims the solo save lock.
export const Entry = lazy(() => new URLSearchParams(window.location.search).has('coop')
  ? import('./coop/CoopScreen.tsx')
  : import('./coop/SoloEntry.tsx'))

export function EntryFallback() {
  const { t } = useT()
  return <div className="flex min-h-full items-center justify-center text-read text-white/50">{t('ui.coop.establishing')}</div>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<EntryFallback />}>
      <Entry />
    </Suspense>
  </StrictMode>,
)
