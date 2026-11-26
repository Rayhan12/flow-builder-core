/**
 * 25+ node Merchant Onboarding stress fixture used by unit and Playwright tests.
 */
import type { LayoutEdgeLike, LayoutNodeLike } from './types.ts'

function n(
  id: string,
  kind: string,
  label: string,
  extra: Partial<LayoutNodeLike> = {},
): LayoutNodeLike {
  return {
    id,
    kind,
    label,
    position: { x: 40, y: 40 },
    ...extra,
  }
}

function e(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  label?: string,
): LayoutEdgeLike {
  return { id, source, target, sourceHandle, label }
}

/** Merchant onboarding + activation flow with branching, parallel, switch, loop. */
export function buildMerchantOnboardingFixture(): {
  nodes: LayoutNodeLike[]
  edges: LayoutEdgeLike[]
  title: string
} {
  const decisionBranches = [
    { id: 'pending', label: 'Pending Admin Review' },
    { id: 'ready', label: 'Ready for Admin' },
    { id: 'fail', label: 'Failed Checks' },
  ]
  const switchBranches = [
    { id: 'approve', label: 'Approve' },
    { id: 'decline', label: 'Decline' },
    { id: 'suspend', label: 'Suspend' },
    { id: 'info', label: 'Request info' },
  ]

  const nodes: LayoutNodeLike[] = [
    n('n1', 'start', 'Start'),
    n('n2', 'inputForm', 'Merchant Intake Form'),
    n('n3', 'integration', 'KYC API Call'),
    n('n4', 'parallelSplit', 'Run Verifications', {
      data: { branches: ['Wathaq', 'LeanTech', 'Elm'] },
    }),
    n('n5', 'integration', 'Wathaq Verification'),
    n('n6', 'integration', 'LeanTech Verification'),
    n('n7', 'integration', 'Elm Verification'),
    n('n8', 'parallelJoin', 'Verifications Complete', {
      data: { waitFor: 'all' },
    }),
    n('n9', 'score', 'Risk Score'),
    n('n10', 'decision', 'Verification & Setup Status', {
      data: { branches: decisionBranches },
    }),
    n('n11', 'step', 'Queue for Admin'),
    n('n12', 'switch', 'Admin Action', {
      data: { branches: switchBranches, mode: 'switch' },
    }),
    n('n13', 'approval', 'Final Approval'),
    n('n14', 'step', 'Account Suspended'),
    n('n15', 'output', 'Create Service Request'),
    n('n16', 'notification', 'Notify Merchant'),
    n('n17', 'loop', 'Retry Documents', {
      data: { collection: 'documents' },
    }),
    n('n18', 'step', 'Collect Missing Docs'),
    n('n19', 'end', 'Account Declined'),
    n('n20', 'end', 'Suspended State'),
    n('n21', 'end', 'Merchant Fully Activated'),
    n('n22', 'step', 'Failed Checks Path'),
    n('n23', 'end', 'Onboarding Failed'),
    n('n24', 'step', 'Activate Products'),
    n('n25', 'timer', 'Cooling Period'),
    n('n26', 'sticky', 'Ops note', {
      label: 'Ops note',
      data: { text: 'Watch Elm SLA' },
    }),
  ]

  const edges: LayoutEdgeLike[] = [
    e('e1', 'n1', 'n2'),
    e('e2', 'n2', 'n3'),
    e('e3', 'n3', 'n4'),
    e('e4', 'n4', 'n5'),
    e('e5', 'n4', 'n6'),
    e('e6', 'n4', 'n7'),
    e('e7', 'n5', 'n8'),
    e('e8', 'n6', 'n8'),
    e('e9', 'n7', 'n8'),
    e('e10', 'n8', 'n9'),
    e('e11', 'n9', 'n10'),
    e('e12', 'n10', 'n11', 'pending', 'Pending Admin Review'),
    e('e13', 'n10', 'n12', 'ready', 'Ready for Admin'),
    e('e14', 'n10', 'n22', 'fail', 'Failed Checks'),
    e('e15', 'n11', 'n12'),
    e('e16', 'n12', 'n13', 'approve', 'Approve'),
    e('e17', 'n12', 'n19', 'decline', 'Decline'),
    e('e18', 'n12', 'n14', 'suspend', 'Suspend'),
    e('e19', 'n12', 'n15', 'info', 'Request info'),
    e('e20', 'n13', 'n24'),
    e('e21', 'n24', 'n21'),
    e('e22', 'n14', 'n20'),
    e('e23', 'n15', 'n17'),
    e('e24', 'n17', 'n18'),
    e('e25', 'n18', 'n17'),
    e('e26', 'n17', 'n16'),
    e('e27', 'n16', 'n12'),
    e('e28', 'n22', 'n25'),
    e('e29', 'n25', 'n23'),
  ]

  return {
    title: 'Merchant Onboarding and Activation Flow',
    nodes,
    edges,
  }
}
