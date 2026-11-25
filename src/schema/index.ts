export {
  CURRENT_SCHEMA_VERSION,
  MAX_EDGES,
  MAX_LABEL_LENGTH,
  MAX_NODES,
  NodeKindSchema,
  DiagramNodeSchema,
  DiagramEdgeSchema,
  DiagramDocSchema,
  DiagramSchema,
  ViewportSchema,
  DiagramThemeSchema,
  createEmptyDiagram,
  createEmptyDiagramDoc,
  parseDiagram,
  parseDiagramDoc,
  type NodeKind,
  type DiagramNode,
  type DiagramEdge,
  type DiagramDoc,
  type Diagram,
} from './diagram'

export { migrations, migrateDiagramDoc, type DiagramMigration } from './migrations'
