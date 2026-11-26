/**
 * TeachAI domain model (11 nodes): the live case where Batches -> Students and
 * Question Banks -> Assessments shared a long vertical bus, and Results ->
 * Generated Content needs a side detour that clears cards.
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
  opts: Partial<LayoutEdgeLike> = {},
): LayoutEdgeLike {
  return { id, source, target, ...opts }
}

/** Exact 11-node TeachAI domain graph from the live MCP verification. */
export function buildTeachAiDomainFixture(): {
  nodes: LayoutNodeLike[]
  edges: LayoutEdgeLike[]
  title: string
} {
  const nodes: LayoutNodeLike[] = [
    n('teacher', 'start', 'Teacher'),
    n('course', 'step', 'Course'),
    n('kb', 'step', 'Knowledge Base'),
    n('banks', 'step', 'Question Banks'),
    n('generated', 'step', 'Generated Content'),
    n('batches', 'step', 'Batches'),
    n('students', 'step', 'Students'),
    n('assessments', 'step', 'Assessments'),
    n('attempts', 'step', 'Attempts'),
    n('grading', 'step', 'Grading'),
    n('results', 'end', 'Results'),
  ]

  const edges: LayoutEdgeLike[] = [
    e('e_teacher_course', 'teacher', 'course'),
    e('e_course_kb', 'course', 'kb'),
    e('e_course_banks', 'course', 'banks'),
    e('e_course_generated', 'course', 'generated'),
    e('e_course_batches', 'course', 'batches'),
    e('e_batches_students', 'batches', 'students'),
    e('e_batches_assessments', 'batches', 'assessments'),
    e('e_banks_assessments', 'banks', 'assessments', { label: 'questions selected into' }),
    e('e_assessments_attempts', 'assessments', 'attempts'),
    e('e_attempts_grading', 'attempts', 'grading'),
    e('e_grading_results', 'grading', 'results'),
    // Long back edge that must route around the side without crossing cards.
    e('e_results_generated', 'results', 'generated', { label: 'AI insights' }),
  ]

  return {
    title: 'TeachAI domain model',
    nodes,
    edges,
  }
}
