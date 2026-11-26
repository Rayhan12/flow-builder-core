import type { NodeTypes } from '@xyflow/react'
import { DecisionNode } from './DecisionNode'
import { EndNode } from './EndNode'
import { GenericNode } from './GenericNode'
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

const generic = GenericNode

export const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  step: StepNode,
  decision: DecisionNode,
  switch: DecisionNode,
  loop: generic,
  parallelSplit: generic,
  parallelJoin: generic,
  delay: generic,
  subflow: generic,
  error: generic,
  mapping: MappingNode,
  integration: IntegrationNode,
  database: generic,
  inputForm: generic,
  output: generic,
  score: generic,
  rule: RuleNode,
  lookup: generic,
  actor: generic,
  approval: generic,
  notification: generic,
  timer: generic,
  event: generic,
  note: NoteNode,
  callout: generic,
  image: generic,
  divider: generic,
  link: generic,
  group: GroupNode,
  shape: ShapeNode,
  sticky: StickyNode,
  section: SectionNode,
}
