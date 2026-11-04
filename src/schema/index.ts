import { Schema } from "effect"

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

const jsonValue: Schema.Schema<JsonValue> = Schema.Union(
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null,
  Schema.Array(Schema.suspend(() => jsonValue)),
  Schema.Record({ key: Schema.String, value: Schema.suspend(() => jsonValue) }),
)

const registryItemType = Schema.Literal(
  "registry:block",
  "registry:color",
  "registry:component",
  "registry:recipe",
  "registry:theme",
  "registry:ui",
)

export type RegistryItemType = typeof registryItemType.Type

const registryFile = Schema.Struct({
  content: Schema.String,
  exports: Schema.optional(Schema.String),
  imports: Schema.optional(Schema.String),
  path: Schema.String,
  type: registryItemType,
})

export type RegistryFile = typeof registryFile.Type

const registryItemImport = Schema.Struct({
  from: Schema.String,
  name: Schema.String,
  type: registryItemType,
})

export type RegistryItemImport = typeof registryItemImport.Type

export const registryItem = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  categories: Schema.optional(Schema.Array(Schema.String)),
  dependencies: Schema.optional(Schema.Array(Schema.String)),
  description: Schema.optional(Schema.String),
  devDependencies: Schema.optional(Schema.Array(Schema.String)),
  files: Schema.optional(Schema.Array(registryFile)),
  name: Schema.String,
  panda: Schema.optional(
    Schema.Struct({
      extension: Schema.optional(jsonValue),
      imports: Schema.optional(Schema.Array(registryItemImport)),
    }),
  ),
  registryDependencies: Schema.optional(Schema.Array(Schema.String)),
  type: registryItemType,
})

export type RegistryItem = typeof registryItem.Type

export const registryIndexList = Schema.Array(
  Schema.Struct({ name: Schema.String, type: registryItemType }),
)

export type Framework = "react" | "vue" | "solid" | "svelte"
