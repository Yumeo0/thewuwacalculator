/*
  Author: Runor Ewhro
  Description: Computes inventory ownership only while the member's inventory
               dialog is mounted, retaining member-scoped editing callbacks.
*/

import type { ComponentProps } from 'react'
import { selInvSg, useAppStore } from '@/application/state'
import { InvMdl } from '@/modules/simulation/features/inventory/InventoryModal.tsx'

type MemberInventoryProps = Omit<ComponentProps<typeof InvMdl>, 'bldUsrsById' | 'echoSgByUid'>

export default function MemberInventory(props: MemberInventoryProps) {
  const usage = useAppStore(selInvSg)

  return (
    <InvMdl
      {...props}
      bldUsrsById={usage.buildUseByBldId}
      echoSgByUid={usage.echoUseByUid}
    />
  )
}
