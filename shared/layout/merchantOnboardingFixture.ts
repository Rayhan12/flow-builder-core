/**
 * 26-node Merchant Onboarding stress fixture used by unit and Playwright tests.
 * Mirrors the live MCP verification flow (long titles, decision/switch chips,
 * wait -> review back edge).
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
  const riskBranches = [
    { id: 'low', label: 'Low risk' },
    { id: 'med', label: 'Medium risk' },
    { id: 'high', label: 'High risk' },
  ]
  const switchBranches = [
    { id: 'approve', label: 'Approve' },
    { id: 'decline', label: 'Decline' },
    { id: 'suspend', label: 'Suspend' },
    { id: 'info', label: 'Request more info' },
  ]

  const nodes: LayoutNodeLike[] = [
    n('start', 'start', 'Merchant applies'),
    n('form', 'inputForm', 'Business details form'),
    n('kyc', 'integration', 'KYC provider check'),
    n('split', 'parallelSplit', 'Run verifications'),
    n('bank', 'integration', 'Bank account verification'),
    n('tax', 'integration', 'Tax ID lookup'),
    n('sanc', 'integration', 'Sanctions screening'),
    n('join', 'parallelJoin', 'Verifications complete'),
    n('score', 'score', 'Risk score'),
    n('risk', 'decision', 'Risk level?', { data: { branches: riskBranches } }),
    n('auto', 'step', 'Auto approve account'),
    n('review', 'approval', 'Manual compliance review'),
    n('decl1', 'end', 'Account Declined (high risk)'),
    n('admin', 'switch', 'Admin Action', {
      data: { branches: switchBranches, mode: 'switch' },
    }),
    n('reqinfo', 'notification', 'Email merchant for documents'),
    n('wait', 'delay', 'Wait for documents (7 days)'),
    n('decl2', 'end', 'Account Declined by admin'),
    n('susp', 'end', 'Suspended State pending investigation'),
    n('create', 'step', 'Create merchant account'),
    n('svc', 'integration', 'Create Service Request'),
    n('loop', 'loop', 'For each payout method'),
    n('payout', 'integration', 'Register payout method'),
    n('welcome', 'notification', 'Send welcome email'),
    n('train', 'step', 'Schedule onboarding call'),
    n('first', 'event', 'First transaction received'),
    n('active', 'end', 'Merchant Active'),
  ]

  const edges: LayoutEdgeLike[] = [
    e('e1', 'start', 'form'),
    e('e2', 'form', 'kyc'),
    e('e3', 'kyc', 'split'),
    e('e4', 'split', 'bank'),
    e('e5', 'split', 'tax'),
    e('e6', 'split', 'sanc'),
    e('e7', 'bank', 'join'),
    e('e8', 'tax', 'join'),
    e('e9', 'sanc', 'join'),
    e('e10', 'join', 'score'),
    e('e11', 'score', 'risk'),
    e('e12', 'risk', 'auto', 'low', 'Low risk'),
    e('e13', 'risk', 'review', 'med', 'Medium risk'),
    e('e14', 'risk', 'decl1', 'high', 'High risk'),
    e('e15', 'review', 'admin'),
    e('e16', 'admin', 'create', 'approve', 'Approve'),
    e('e17', 'admin', 'decl2', 'decline', 'Decline'),
    e('e18', 'admin', 'susp', 'suspend', 'Suspend'),
    e('e19', 'admin', 'reqinfo', 'info', 'Request more info'),
    e('e20', 'reqinfo', 'wait'),
    // Back edge / cycle: wait returns to review.
    e('e21', 'wait', 'review'),
    e('e22', 'auto', 'create'),
    e('e23', 'create', 'svc'),
    e('e24', 'svc', 'loop'),
    e('e25', 'loop', 'payout'),
    e('e26', 'payout', 'welcome'),
    e('e27', 'welcome', 'train'),
    e('e28', 'train', 'first'),
    e('e29', 'first', 'active'),
  ]

  return {
    title: 'Merchant Onboarding and Activation Flow',
    nodes,
    edges,
  }
}

/**
 * 40-node variant with two loops for regression stress.
 * Keeps the base 26-node merchant graph intact and appends a side chain that
 * has its own decision plus a second wait->review style back edge.
 */
export function buildMerchantOnboarding40Fixture(): {
  nodes: LayoutNodeLike[]
  edges: LayoutEdgeLike[]
  title: string
} {
  const base = buildMerchantOnboardingFixture()
  const extraNodes: LayoutNodeLike[] = [
    n('sideStart', 'step', 'Secondary ops intake'),
    n('fraud', 'decision', 'Fraud signals?', {
      data: {
        branches: [
          { id: 'clean', label: 'Clean' },
          { id: 'flag', label: 'Flagged' },
        ],
      },
    }),
    n('fraudReview', 'approval', 'Fraud desk review'),
    n('fraudWait', 'delay', 'Hold for fraud docs (3 days)'),
    n('fraudOk', 'step', 'Clear fraud hold'),
    n('fraudEnd', 'end', 'Closed for fraud'),
    n('opsLoop', 'loop', 'For each product SKU'),
    n('opsStep', 'step', 'Provision product SKU'),
    n('opsJoin', 'step', 'Products provisioned'),
    n('billing', 'integration', 'Create billing profile'),
    n('tax2', 'integration', 'Secondary tax check'),
    n('notify2', 'notification', 'Ops escalation email'),
    n('sla', 'timer', 'SLA countdown'),
    n('doneExtra', 'end', 'Secondary path complete'),
  ]
  const extraEdges: LayoutEdgeLike[] = [
    // Hang the side chain off the activated merchant end so base routing stays clean.
    e('ex1', 'active', 'sideStart'),
    e('ex2', 'sideStart', 'fraud'),
    e('ex3', 'fraud', 'opsLoop', 'clean', 'Clean'),
    e('ex4', 'fraud', 'fraudReview', 'flag', 'Flagged'),
    e('ex5', 'fraudReview', 'fraudWait'),
    // Second loop (in addition to wait->review in the base graph).
    e('ex6', 'fraudWait', 'fraudReview'),
    e('ex7', 'fraudReview', 'fraudOk'),
    e('ex8', 'fraudOk', 'opsLoop'),
    e('ex9', 'fraudReview', 'fraudEnd'),
    e('ex10', 'opsLoop', 'opsStep'),
    e('ex11', 'opsStep', 'opsJoin'),
    e('ex12', 'opsJoin', 'billing'),
    e('ex13', 'billing', 'tax2'),
    e('ex14', 'tax2', 'notify2'),
    e('ex15', 'notify2', 'sla'),
    e('ex16', 'sla', 'doneExtra'),
  ]
  return {
    title: 'Merchant Onboarding 40-node stress',
    nodes: [...base.nodes, ...extraNodes],
    edges: [...base.edges, ...extraEdges],
  }
}
