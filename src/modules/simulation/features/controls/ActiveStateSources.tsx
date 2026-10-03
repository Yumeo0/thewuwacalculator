/*
  Author: Runor Ewhro
  Description: renders the active-state explanation tree for evaluation targets,
               splitting the active resonator from support sources so users can
               see which buffs and conditions feed the selected build.
*/

import { DisplayImage } from '@/shared/ui/DisplayImage'
import type { ReactEventHandler } from 'react'
import type { StateGroup } from '@/modules/simulation/model/stateSummary.ts'
import { Expandable } from '@/shared/ui/Expandable'

interface ActiveStateSourcesProps {
  groups: StateGroup[]
  activeResId: string | null
  memberCount: number
  className?: string
  onImageError: ReactEventHandler<HTMLImageElement>
}

function StateSourceGroup({
  group,
  role,
  onImageError,
}: {
  group: StateGroup
  role: 'active' | 'support'
  onImageError: ReactEventHandler<HTMLImageElement>
}) {
  // each group is already reduced by the model layer into scope branches, so
  // this component only exposes branch counts and effect labels without trying
  // to re-interpret combat state
  const branchCount = group.scopes.length

  return (
    <Expandable
      as="article" className="wk-source"
      triggerClass="wk-source-trigger"
      contentClass="wk-source-body"
      innerClass="wk-source-scopes"
      chevronClass="wk-source-chevron"
      chevronSize={14}
      defaultOpen
      data-role={role}
      header={
        <div className="wk-source-head">
          <span className="wk-source-frame">
            <DisplayImage
              src={group.srcProf || '/assets/game/default.webp'}
              alt={group.sourceName} className="wk-source-avatar"
              loading="lazy"
              decoding="async"
              onError={onImageError}
            />
          </span>
          <span className="wk-source-id">
            <span className="wk-source-role">{role === 'active' ? 'Active' : 'Support'}</span>
            <strong className="wk-source-name">{group.sourceName}</strong>
          </span>
          <span className="wk-source-count">
            {branchCount}
            <i>{branchCount === 1 ? 'branch' : 'branches'}</i>
          </span>
        </div>
      }
    >
      {group.scopes.map((scope) => (
        <section key={scope.id} className="wk-scope">
          <div className="wk-scope-head">
            <span className="wk-scope-label">{scope.label}</span>
            <span className="wk-scope-count">{scope.nodes.length}</span>
          </div>

          <div className="wk-scope-nodes">
            {scope.nodes.map((node) => (
              <section key={node.id} className="wk-node">
                <strong className="wk-node-owner">{node.ownerLabel}</strong>
                <ul className="wk-node-effects">
                  {node.effectLabels.length > 0 ? (
                    node.effectLabels.map((label, index) => (
                      <li
                        key={`${node.id}-${index}`} className="wk-node-effect"
                        dangerouslySetInnerHTML={{ __html: label }}
                      />
                    ))
                  ) : (
                    <li className="wk-node-effect wk-node-effect--bare">Active</li>
                  )}
                </ul>
              </section>
            ))}
          </div>
        </section>
      ))}
    </Expandable>
  )
}

export function ActiveStateSources({
  groups,
  activeResId,
  className = '',
  onImageError,
}: ActiveStateSourcesProps) {
  // keep the active source first even when the summary model returns sources in
  // feature discovery order, because this panel is read as self then support
  const activeGroup = groups.find((group) => group.sourceId === activeResId) ?? null
  const supportGroups = groups.filter((group) => group.sourceId !== activeResId)

  return (
    <section className={`wk-states ${className}`.trim()} aria-label="Active state sources">
      <header className="wk-states-head">
        <h3 className="wk-states-title">Active State Sources</h3>
      </header>

      {groups.length > 0 ? (
        <div className="wk-states-grid">
          {activeGroup ? (
            <StateSourceGroup group={activeGroup} role="active" onImageError={onImageError} />
          ) : null}
          {supportGroups.map((group) => (
            <StateSourceGroup key={group.id} group={group} role="support" onImageError={onImageError} />
          ))}
        </div>
      ) : (
        <p className="wk-states-empty">
          No states are feeding this build. Team buffs, skills, and sequences show up here once active.
        </p>
      )}
    </section>
  )
}
