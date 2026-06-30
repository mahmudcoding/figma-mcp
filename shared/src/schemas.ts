import { z } from "zod";
import { PluginCommand } from "./protocol.js";

const PaintSchema = z.record(z.unknown());
const EffectSchema = z.record(z.unknown());

export const EmptyPayloadSchema = z.object({}).strict();

export const NodeIdSchema = z.object({
  nodeId: z.string().min(1)
}).strict();

export const ParentPlacementSchema = z.object({
  parentId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  index: z.number().int().nonnegative().optional()
}).strict();

export const BoundsSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().finite().optional(),
  height: z.number().positive().finite().optional()
}).strict();

export const LayoutSchema = z.object({
  layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(),
  primaryAxisSizingMode: z.enum(["FIXED", "AUTO"]).optional(),
  counterAxisSizingMode: z.enum(["FIXED", "AUTO"]).optional(),
  primaryAxisAlignItems: z.enum(["MIN", "CENTER", "MAX", "SPACE_BETWEEN"]).optional(),
  counterAxisAlignItems: z.enum(["MIN", "CENTER", "MAX", "BASELINE"]).optional(),
  itemSpacing: z.number().finite().optional(),
  paddingTop: z.number().finite().optional(),
  paddingRight: z.number().finite().optional(),
  paddingBottom: z.number().finite().optional(),
  paddingLeft: z.number().finite().optional()
}).strict();

export const NodeStyleSchema = z.object({
  fills: z.array(PaintSchema).optional(),
  strokes: z.array(PaintSchema).optional(),
  effects: z.array(EffectSchema).optional(),
  strokeWeight: z.number().nonnegative().finite().optional(),
  cornerRadius: z.number().nonnegative().finite().optional(),
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  rotation: z.number().finite().optional()
}).strict();

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema)
  ])
);

export const FindNodesSchema = z.object({
  query: z.string().min(1).optional(),
  nameContains: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  includeChildren: z.boolean().default(false).optional(),
  allPages: z.boolean().default(false).optional(),
  maxResults: z.number().int().positive().max(1000).default(100).optional()
}).strict();

export const CreateFrameSchema = ParentPlacementSchema.merge(BoundsSchema).extend({
  name: z.string().min(1).default("Frame").optional(),
  layout: LayoutSchema.optional(),
  style: NodeStyleSchema.optional()
}).strict();

export const CreateTextSchema = ParentPlacementSchema.merge(BoundsSchema).extend({
  name: z.string().min(1).default("Text").optional(),
  characters: z.string().default("").optional(),
  fontFamily: z.string().min(1).default("Inter").optional(),
  fontStyle: z.string().min(1).default("Regular").optional(),
  fontSize: z.number().positive().finite().default(16).optional(),
  style: NodeStyleSchema.optional()
}).strict();

export const CreateRectangleSchema = ParentPlacementSchema.merge(BoundsSchema).extend({
  name: z.string().min(1).default("Rectangle").optional(),
  style: NodeStyleSchema.optional()
}).strict();

export const CreateComponentSchema = ParentPlacementSchema.merge(BoundsSchema).extend({
  name: z.string().min(1).default("Component").optional(),
  layout: LayoutSchema.optional(),
  style: NodeStyleSchema.optional()
}).strict();

export const CreateAutoLayoutSchema = ParentPlacementSchema.merge(BoundsSchema).extend({
  name: z.string().min(1).default("Auto Layout").optional(),
  layout: LayoutSchema.default({ layoutMode: "VERTICAL" }).optional(),
  style: NodeStyleSchema.optional()
}).strict();

export const CreateNodeSchema = ParentPlacementSchema.extend({
  createMethod: z.string().regex(/^create[A-Z]/, "createMethod must be a figma.create* method"),
  args: z.array(JsonValueSchema).default([]).optional(),
  properties: z.record(JsonValueSchema).default({}).optional()
}).strict();

export const UpdateNodeSchema = NodeIdSchema.extend({
  name: z.string().min(1).optional(),
  characters: z.string().optional(),
  fontFamily: z.string().min(1).optional(),
  fontStyle: z.string().min(1).optional(),
  fontSize: z.number().positive().finite().optional(),
  bounds: BoundsSchema.optional(),
  layout: LayoutSchema.optional(),
  style: NodeStyleSchema.optional()
}).strict();

export const MoveNodeSchema = NodeIdSchema.extend({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  parentId: z.string().min(1).optional(),
  index: z.number().int().nonnegative().optional()
}).strict();

export const ResizeNodeSchema = NodeIdSchema.extend({
  width: z.number().positive().finite(),
  height: z.number().positive().finite()
}).strict();

export const DeleteNodeSchema = NodeIdSchema.extend({
  hardDelete: z.boolean().default(true).optional()
}).strict();

export const DuplicateNodeSchema = NodeIdSchema.extend({
  parentId: z.string().min(1).optional(),
  offsetX: z.number().finite().default(24).optional(),
  offsetY: z.number().finite().default(24).optional()
}).strict();

export const ExportNodeSchema = NodeIdSchema.extend({
  format: z.enum(["PNG", "JPG", "SVG", "PDF"]).default("PNG").optional(),
  scale: z.number().positive().max(4).default(1).optional()
}).strict();

export const UpdateVariableSchema = z.object({
  variableId: z.string().min(1).optional(),
  variableKey: z.string().min(1).optional(),
  modeId: z.string().min(1),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.object({
      r: z.number(),
      g: z.number(),
      b: z.number(),
      a: z.number().optional()
    }).strict()
  ])
}).strict();

export const BatchOperationSchema = z.object({
  command: z.nativeEnum(PluginCommand),
  payload: z.record(z.unknown())
}).strict();

export const BatchOperationsSchema = z.object({
  operations: z.array(BatchOperationSchema).min(1).max(100),
  continueOnError: z.boolean().default(false).optional(),
  transactional: z.boolean().default(true).optional(),
  rollbackOnError: z.boolean().default(true).optional()
}).strict();

export const GetApiSchemaSchema = z.object({
  category: z.string().min(1).optional(),
  objectName: z.string().min(1).optional(),
  memberName: z.string().min(1).optional(),
  restOperationId: z.string().min(1).optional(),
  mutatesCanvas: z.boolean().optional(),
  limit: z.number().int().positive().max(5000).default(500).optional()
}).strict();

export const ApiTargetSchema = z.enum([
  "figma",
  "root",
  "currentPage",
  "selection",
  "node",
  "page",
  "style",
  "variable",
  "variableCollection",
  "variables",
  "teamLibrary",
  "codegen",
  "devResources",
  "clientStorage",
  "parameters",
  "ui",
  "image",
  "path"
]);

export const CallApiSchema = z.object({
  target: ApiTargetSchema,
  method: z.string().min(1),
  args: z.array(JsonValueSchema).default([]).optional(),
  targetPath: z.array(z.string().min(1)).optional(),
  nodeId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  styleId: z.string().min(1).optional(),
  variableId: z.string().min(1).optional(),
  variableCollectionId: z.string().min(1).optional(),
  imageHash: z.string().min(1).optional()
}).strict();

export const GetPropertySchema = z.object({
  target: ApiTargetSchema,
  property: z.string().min(1),
  targetPath: z.array(z.string().min(1)).optional(),
  nodeId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  styleId: z.string().min(1).optional(),
  variableId: z.string().min(1).optional(),
  variableCollectionId: z.string().min(1).optional(),
  imageHash: z.string().min(1).optional()
}).strict();

export const SetPropertySchema = GetPropertySchema.extend({
  value: JsonValueSchema
}).strict();

export const SubscribeEventSchema = z.object({
  eventType: z.string().min(1),
  target: ApiTargetSchema.default("figma").optional(),
  targetPath: z.array(z.string().min(1)).optional(),
  nodeId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  styleId: z.string().min(1).optional(),
  variableId: z.string().min(1).optional(),
  variableCollectionId: z.string().min(1).optional(),
  imageHash: z.string().min(1).optional(),
  once: z.boolean().default(false).optional(),
  loadAllPages: z.boolean().default(true).optional(),
  defaultReturn: JsonValueSchema.optional(),
  maxQueueSize: z.number().int().positive().max(5000).default(1000).optional()
}).strict();

export const UnsubscribeEventSchema = z.object({
  subscriptionId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional()
}).strict();

export const PollEventsSchema = z.object({
  eventType: z.string().min(1).optional(),
  sinceSequence: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(1000).default(100).optional()
}).strict();

export const RestRequestSchema = z.object({
  operationId: z.string().min(1).optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  path: z.string().min(1).optional(),
  pathParams: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}).optional(),
  query: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))])).default({}).optional(),
  body: JsonValueSchema.optional(),
  headers: z.record(z.string()).default({}).optional(),
  userId: z.string().min(1).optional()
}).strict();

export const CommandSchemas = {
  [PluginCommand.GET_DOCUMENT]: EmptyPayloadSchema,
  [PluginCommand.GET_CURRENT_PAGE]: EmptyPayloadSchema,
  [PluginCommand.GET_SELECTION]: EmptyPayloadSchema,
  [PluginCommand.FIND_NODES]: FindNodesSchema,
  [PluginCommand.GET_NODE]: NodeIdSchema,
  [PluginCommand.CREATE_FRAME]: CreateFrameSchema,
  [PluginCommand.CREATE_TEXT]: CreateTextSchema,
  [PluginCommand.CREATE_RECTANGLE]: CreateRectangleSchema,
  [PluginCommand.CREATE_COMPONENT]: CreateComponentSchema,
  [PluginCommand.CREATE_AUTOLAYOUT]: CreateAutoLayoutSchema,
  [PluginCommand.CREATE_NODE]: CreateNodeSchema,
  [PluginCommand.UPDATE_NODE]: UpdateNodeSchema,
  [PluginCommand.MOVE_NODE]: MoveNodeSchema,
  [PluginCommand.RESIZE_NODE]: ResizeNodeSchema,
  [PluginCommand.DELETE_NODE]: DeleteNodeSchema,
  [PluginCommand.DUPLICATE_NODE]: DuplicateNodeSchema,
  [PluginCommand.EXPORT_NODE]: ExportNodeSchema,
  [PluginCommand.LIST_STYLES]: EmptyPayloadSchema,
  [PluginCommand.LIST_VARIABLES]: EmptyPayloadSchema,
  [PluginCommand.UPDATE_VARIABLE]: UpdateVariableSchema,
  [PluginCommand.BATCH_OPERATIONS]: BatchOperationsSchema,
  [PluginCommand.GET_API_SCHEMA]: GetApiSchemaSchema,
  [PluginCommand.CALL_API]: CallApiSchema,
  [PluginCommand.GET_PROPERTY]: GetPropertySchema,
  [PluginCommand.SET_PROPERTY]: SetPropertySchema,
  [PluginCommand.REST_REQUEST]: RestRequestSchema,
  [PluginCommand.SUBSCRIBE_EVENT]: SubscribeEventSchema,
  [PluginCommand.UNSUBSCRIBE_EVENT]: UnsubscribeEventSchema,
  [PluginCommand.POLL_EVENTS]: PollEventsSchema
} as const;

export type CommandSchemaMap = typeof CommandSchemas;
