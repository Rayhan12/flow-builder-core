import type { NodeTypes } from '@xyflow/react'
import { DecisionNode } from './DecisionNode'
import { EndNode } from './EndNode'
import { GroupNode } from './GroupNode'
import { IntegrationNode } from './IntegrationNode'
import { MappingNode } from './MappingNode'
import { NoteNode } from './NoteNode'
import { RuleNode } from './RuleNode'
import { SectionNode } from './SectionNode'
import { ShapeNode } from './ShapeNode'
import { StartNode } from './StartNode'
import { StepNode } from './StepNode'
import { StickyNode } from './StickyNode'

export const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  step: StepNode,
  decision: DecisionNode,
  mapping: MappingNode,
  integration: IntegrationNode,
  rule: RuleNode,
  note: NoteNode,
  group: GroupNode,
  shape: ShapeNode,
  sticky: StickyNode,
  section: SectionNode,
}
