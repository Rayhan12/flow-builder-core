/**
 * Size estimates must stay within 10% of Playwright-measured card boxes.
 * Measurements captured from the canvas at 100% zoom with node hints on
 * (Inter 14px, .flow-node padding 12, hint row, branch chips).
 */
import { describe, expect, it } from 'vitest'
import { estimateNodeSize, titleLineCount } from './nodeSizes.ts'

/** Playwright-measured {w,h} for short and long labels per kind. */
const PLAYWRIGHT_MEASURED: Array<{
  kind: string
  label: string
  data?: unknown
  measured: { w: number; h: number }
}> = [
  { kind: 'start', label: 'Start', measured: { w: 176, h: 96 } },
  {
    kind: 'start',
    label: 'Merchant applies for onboarding today',
    measured: { w: 360, h: 104 },
  },
  { kind: 'end', label: 'Done', measured: { w: 176, h: 96 } },
  {
    kind: 'end',
    label: 'Suspended State pending investigation',
    measured: { w: 360, h: 104 },
  },
  { kind: 'step', label: 'Review', measured: { w: 256, h: 96 } },
  {
    kind: 'step',
    label: 'Wait for documents (7 days)',
    measured: { w: 290, h: 96 },
  },
  {
    kind: 'decision',
    label: 'Risk level?',
    data: {
      branches: [
        { id: 'low', label: 'Low risk' },
        { id: 'med', label: 'Medium risk' },
        { id: 'high', label: 'High risk' },
      ],
    },
    measured: { w: 327, h: 172 },
  },
  {
    kind: 'switch',
    label: 'Admin Action',
    data: {
      branches: [
        { id: 'approve', label: 'Approve' },
        { id: 'decline', label: 'Decline' },
        { id: 'suspend', label: 'Suspend' },
        { id: 'info', label: 'Request more info' },
      ],
    },
    measured: { w: 596, h: 172 },
  },
  { kind: 'delay', label: 'Wait', measured: { w: 256, h: 96 } },
  {
    kind: 'delay',
    label: 'Wait for documents (7 days)',
    measured: { w: 290, h: 96 },
  },
  { kind: 'approval', label: 'Review', measured: { w: 256, h: 96 } },
  {
    kind: 'approval',
    label: 'Manual compliance review desk',
    measured: { w: 310, h: 96 },
  },
  { kind: 'integration', label: 'API', measured: { w: 256, h: 96 } },
  {
    kind: 'integration',
    label: 'Bank account verification call',
    measured: { w: 300, h: 96 },
  },
  { kind: 'notification', label: 'Email', measured: { w: 256, h: 96 } },
  {
    kind: 'notification',
    label: 'Email merchant for documents',
    measured: { w: 290, h: 96 },
  },
  { kind: 'parallelSplit', label: 'Split', measured: { w: 256, h: 96 } },
  { kind: 'parallelJoin', label: 'Join', measured: { w: 256, h: 96 } },
  { kind: 'loop', label: 'Loop', measured: { w: 256, h: 96 } },
  { kind: 'score', label: 'Score', measured: { w: 256, h: 96 } },
  { kind: 'timer', label: 'Timer', measured: { w: 256, h: 96 } },
  { kind: 'event', label: 'Event', measured: { w: 256, h: 96 } },
  { kind: 'inputForm', label: 'Form', measured: { w: 256, h: 96 } },
  {
    kind: 'inputForm',
    label: 'Business details intake form',
    measured: { w: 300, h: 96 },
  },
]

function withinTenPercent(estimated: number, measured: number): boolean {
  if (measured <= 0) return false
  return Math.abs(estimated - measured) / measured <= 0.1
}

describe('estimateNodeSize vs Playwright measurements', () => {
  for (const sample of PLAYWRIGHT_MEASURED) {
    it(`${sample.kind} "${sample.label}" within 10%`, () => {
      const est = estimateNodeSize({
        kind: sample.kind,
        label: sample.label,
        data: sample.data,
      })
      expect(
        withinTenPercent(est.w, sample.measured.w),
        `width est=${est.w} measured=${sample.measured.w}`,
      ).toBe(true)
      expect(
        withinTenPercent(est.h, sample.measured.h),
        `height est=${est.h} measured=${sample.measured.h}`,
      ).toBe(true)
    })
  }

  it('wraps long titles across multiple lines instead of truncating', () => {
    expect(titleLineCount('Suspended State pending investigation', 280)).toBeGreaterThanOrEqual(2)
    expect(titleLineCount('Go', 256)).toBe(1)
  })
})
