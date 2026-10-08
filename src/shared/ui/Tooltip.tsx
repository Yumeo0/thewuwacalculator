/*
  Author: Runor Ewhro
  Description: Shared radix-tooltip wrapper with app-level defaults for delay,
               placement, and close timing.
*/

import React from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import type {
  CSSProperties,
  ReactNode} from 'react'
import { useLayoutEffect, useRef } from 'react'
import {
  AppPopupSurface,
  syncAppPopupTokens,
  useAppPopup,
} from '@/shared/ui/AppPopup'

export interface TooltipProps {
  children: ReactNode
  content: ReactNode
  placement?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  triggerStyle?: CSSProperties
  delay?: number
}

export function AppTltpProv({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={140} skipDelayDuration={120} disableHoverableContent>
      {children}
    </RadixTooltip.Provider>
  )
}

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  placement = 'top',
  className = '',
  triggerStyle,
  delay = 200,
}) => {
  const popup = useAppPopup()
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const scopeRef = useRef<HTMLDivElement | null>(null)
  const changeOpen = (nextOpen: boolean) => nextOpen ? popup.show() : popup.hide()
  const popupPlacement = placement === 'top' ? 'up' : placement === 'bottom' ? 'down' : placement

  useLayoutEffect(() => {
    if (popup.visible && triggerRef.current && scopeRef.current) {
      syncAppPopupTokens(triggerRef.current, scopeRef.current)
    }
  })

  return (
    <RadixTooltip.Root
      open={popup.open}
      onOpenChange={changeOpen}
      delayDuration={delay}
      disableHoverableContent
    >
      <RadixTooltip.Trigger asChild>
        <span ref={triggerRef} className={`tooltip-trigger ${className}`.trim()} style={{ display: 'inline-flex', ...triggerStyle }}>
          {children}
        </span>
      </RadixTooltip.Trigger>
      {/*
        forceMount belongs on the portal as well as the content: radix gates the
        portal on `open` alone, so without it the subtree is torn out the instant
        the tooltip closes and the exit animation never paints. The popup's own
        visibility gate below still unmounts once the exit has finished.
      */}
      {popup.visible ? (
        <RadixTooltip.Portal forceMount>
          <RadixTooltip.Content
            ref={scopeRef}
            forceMount
            side={placement}
            sideOffset={8}
            collisionPadding={12} className="app-tooltip-container"
            style={{ zIndex: 99999 }}
          >
            <AppPopupSurface className="app-tooltip-content"
              open={popup.open}
              closing={popup.closing}
              placement={popupPlacement}
            >
              {content}
            </AppPopupSurface>
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      ) : null}
    </RadixTooltip.Root>
  )
}

export interface HoverCardProps {
  // The trigger remains mounted permanently; hover/focus handlers are attached
  // to the wrapper instead of mutating the child.
  children: ReactNode
  // A function defers expensive catalog lookup/formatting until the first
  // visible frame instead of paying it during the parent render.
  content: ReactNode | (() => ReactNode)
  // Disabled instances skip portal and pointer work while preserving trigger layout.
  disabled?: boolean
  label?: string
  // Class hooks are split so caller skins can target trigger, portal root, and
  // measured card independently of the shared placement mechanics.
  triggerClassName?: string
  rootClassName?: string
  cardClassName?: string
  offsetX?: number
  offsetY?: number
  exitMs?: number
}
