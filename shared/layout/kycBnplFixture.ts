/**
 * 25+ node KYC / BNPL approval flow for FLOWFIX5 stress tests.
 * Two decisions, a switch, parallel split/join, two loop/back edges, long labels.
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

export function buildKycBnplFixture(): {
  nodes: LayoutNodeLike[]
  edges: LayoutEdgeLike[]
  title: string
} {
  const affordability = [
    { id: 'pass', label: 'Affordability pass' },
    { id: 'borderline', label: 'Borderline affordability' },
    { id: 'fail', label: 'Affordability fail' },
  ]
  const kycBranches = [
    { id: 'clear', label: 'KYC clear' },
    { id: 'review', label: 'Needs manual KYC review' },
    { id: 'reject', label: 'KYC reject hard stop' },
  ]
  const underwriter = [
    { id: 'approve', label: 'Approve BNPL limit' },
    { id: 'reduce', label: 'Approve with reduced limit' },
    { id: 'decline', label: 'Decline application' },
    { id: 'docs', label: 'Request additional documents' },
  ]

  const nodes: LayoutNodeLike[] = [
    n('start', 'start', 'Customer starts BNPL application'),
    n('form', 'inputForm', 'Collect income and identity details'),
    n('split', 'parallelSplit', 'Run KYC and credit checks in parallel'),
    n('idv', 'integration', 'Identity verification provider call'),
    n('sanctions', 'integration', 'Sanctions and PEP screening lookup'),
    n('bureau', 'integration', 'Credit bureau soft pull'),
    n('join', 'parallelJoin', 'Parallel checks complete'),
    n('kyc', 'decision', 'KYC outcome?', { data: { branches: kycBranches } }),
    n('kycReject', 'end', 'Application closed after hard KYC reject'),
    n('kycDesk', 'approval', 'Manual KYC desk review queue'),
    n('kycWait', 'delay', 'Wait for KYC documents (5 business days)'),
    n('afford', 'decision', 'Affordability assessment?', {
      data: { branches: affordability },
    }),
    n('autoLimit', 'step', 'Assign standard BNPL credit limit'),
    n('uw', 'switch', 'Underwriter action', {
      data: { branches: underwriter, mode: 'switch' },
    }),
    n('failEnd', 'end', 'Affordability fail: application declined'),
    n('docs', 'notification', 'Email customer for additional documents'),
    n('docsWait', 'delay', 'Wait for document upload (7 days)'),
    n('reduce', 'step', 'Create BNPL account with reduced limit'),
    n('approve', 'step', 'Create BNPL account at full approved limit'),
    n('declineEnd', 'end', 'Underwriter declined the BNPL application'),
    n('activate', 'integration', 'Provision BNPL product in core ledger'),
    n('loop', 'loop', 'For each linked payment method'),
    n('tokenise', 'integration', 'Tokenise payment method with vault'),
    n('welcome', 'notification', 'Send BNPL welcome and limit email'),
    n('first', 'event', 'First BNPL purchase authorised'),
    n('active', 'end', 'BNPL facility active and ready'),
  ]

  const edges: LayoutEdgeLike[] = [
    e('e1', 'start', 'form'),
    e('e2', 'form', 'split'),
    e('e3', 'split', 'idv'),
    e('e4', 'split', 'sanctions'),
    e('e5', 'split', 'bureau'),
    e('e6', 'idv', 'join'),
    e('e7', 'sanctions', 'join'),
    e('e8', 'bureau', 'join'),
    e('e9', 'join', 'kyc'),
    e('e10', 'kyc', 'afford', 'clear', 'KYC clear'),
    e('e11', 'kyc', 'kycDesk', 'review', 'Needs manual KYC review'),
    e('e12', 'kyc', 'kycReject', 'reject', 'KYC reject hard stop'),
    e('e13', 'kycDesk', 'kycWait'),
    // Back edge / loop 1: wait returns to KYC desk.
    e('e14', 'kycWait', 'kycDesk'),
    e('e15', 'kycDesk', 'afford'),
    e('e16', 'afford', 'autoLimit', 'pass', 'Affordability pass'),
    e('e17', 'afford', 'uw', 'borderline', 'Borderline affordability'),
    e('e18', 'afford', 'failEnd', 'fail', 'Affordability fail'),
    e('e19', 'autoLimit', 'approve'),
    e('e20', 'uw', 'approve', 'approve', 'Approve BNPL limit'),
    e('e21', 'uw', 'reduce', 'reduce', 'Approve with reduced limit'),
    e('e22', 'uw', 'declineEnd', 'decline', 'Decline application'),
    e('e23', 'uw', 'docs', 'docs', 'Request additional documents'),
    e('e24', 'docs', 'docsWait'),
    // Back edge / loop 2: document wait returns to underwriter.
    e('e25', 'docsWait', 'uw'),
    e('e26', 'reduce', 'activate'),
    e('e27', 'approve', 'activate'),
    e('e28', 'activate', 'loop'),
    e('e29', 'loop', 'tokenise'),
    e('e30', 'tokenise', 'welcome'),
    e('e31', 'welcome', 'first'),
    e('e32', 'first', 'active'),
  ]

  return {
    title: 'KYC and BNPL Approval Flow',
    nodes,
    edges,
  }
}
