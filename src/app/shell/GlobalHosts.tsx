/*
  Author: Runor Ewhro
  Description: Mounts app-wide singleton hosts outside the route lifecycle so
               their state survives navigation.
*/

import { lazy, Suspense, useState } from 'react'
import { NavHold } from '@/app/nav/NavHold'
import { DlyNtc } from '@/app/shell/DailyNotice'
import { NtfcTstCntn } from '@/shared/ui/NotificationToast'
import { CookieBanner } from '@/app/shell/CookieBanner'
import { BetaNoticeModal } from '@/app/shell/BetaNoticeModal'
import { useCkBnnr } from '@/app/hooks/useCookieBanner.ts'

const EchoImportHost = lazy(async () => ({ default: (await import('@/modules/simulation/api/globalHosts')).EchoImportHost }))
const ImportStamp = lazy(async () => ({ default: (await import('@/modules/simulation/api/globalHosts')).ImportStamp }))
const EnemyConsoleHost = lazy(async () => ({ default: (await import('@/modules/simulation/api/globalHosts')).EnemyConsoleHost }))

export function GlobalHosts({ simulating }: { simulating: boolean }) {
  const cookieBanner = useCkBnnr()
  const [simulationVisited, setSimulationVisited] = useState(simulating)
  if (simulating && !simulationVisited) setSimulationVisited(true)

  return (
    <>
      {simulationVisited ? <Suspense fallback={null}><EchoImportHost /><ImportStamp />
        {simulating ? <EnemyConsoleHost /> : null}</Suspense> : null}
      <NavHold />
      <DlyNtc />
      <NtfcTstCntn />
      <CookieBanner
        visible={cookieBanner.visible}
        open={cookieBanner.open}
        closing={cookieBanner.closing}
        onAccept={cookieBanner.accept}
      />
      {import.meta.env.MODE === 'beta' ? <BetaNoticeModal /> : null}
    </>
  )
}
