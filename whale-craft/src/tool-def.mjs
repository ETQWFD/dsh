/**
 * 工具定义：优先用宿主 `@deepseek-ai/dsh-tools` 的 `defineTool`，拿不到用这里的内置等价实现。
 * ============================================================================
 * 🔴 2026-10-04（GitHub issue #5）：官方 dsh-desktop 上插件报 `failed to import` ——
 *    真实原因是 `index.js` 顶层**静态** import 了 `@deepseek-ai/dsh-tools` 与 `schemastery`，
 *    而它们是 **optional peer**（包管理器永远不装；宿主解析层在 desktop 上又喂不进来）
 *    ⇒ 模块**链接期**就失败，loader 拿不到 fiber。同一个坑本仓库在 dsh-llm 上踩过一次
 *    （见 src/user-message.mjs 头注释），所以这里沿用同一条路：**宿主优先，拿不到用内置**。
 *
 * 内置实现与宿主逐字对齐的两处关键（对不上会静默走样，"无宿主模拟"自检会当场红）：
 *   ① JSON Schema 的 **key 顺序**：标量 `{type, 然后 description/title/default/examples, enum, const}`；
 *      object `{type, 注解, additionalProperties, properties(声明了才有), required(非空才有)}`；
 *      array `{type, 注解, items}`；`json` = 仅注解、无 type；属性上的 `required:true` 收进**父级** required 数组。
 *   ② 入参校验的**报错文案与路径**（宿主把它当模型可见信息）：
 *      `"arguments" must be an object` · `missing required property "x"` ·
 *      `"y" is not a declared property (additionalProperties: false)` · …（见 validateJsonSchemaValue）。
 *
 * ⚠️ 已知退化（任务书认可）：内置抛的 ToolArgsError 不是宿主 `HarnessError` 子类（拿不到宿主类），
 *    宿主显示层会退化成通用错误；文案保持逐字一致。
 * ============================================================================
 */

const ANNOTATION_KEYS = ['description', 'title', 'default', 'examples']
const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])

/** 宿主那份 `defineTool`（解析不到就是 null）；`loadNote` 供调用方记日志 */
export let hostDefineTool = null
export let loadNote = ''
try {
  const mod = await import('@deepseek-ai/dsh-tools')
  hostDefineTool = typeof mod?.defineTool === 'function' ? mod.defineTool : null
  if (!hostDefineTool) loadNote = '包里没有 defineTool 导出'
} catch (e) {
  loadNote = `解析不到 @deepseek-ai/dsh-tools（${e?.code ?? e?.message ?? e}）`
}

/** 诊断用：现在走的是哪条路（日志/自检会报） */
export const toolDefKind = () => (typeof hostDefineTool === 'function' ? 'host' : 'builtin')

/**
 * 定义工具：**优先宿主实现**（形状永远跟得上宿主），拿不到用内置等价实现。
 * 两条路产出的注册形状一致：`{name, description, parameters, output:{schema, render}, [timeoutMs], execute}`。
 */
export function defineTool (options) {
  return typeof hostDefineTool === 'function' ? hostDefineTool(options) : builtinDefineTool(options)
}

/* ───────────────────────── 内置实现 ───────────────────────── */

function authorError (message) { throw new Error(`defineTool 参数表不合法：${message}`) }

function assertKeys (source, allowed, path) {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) authorError(`${path}.${key} 不支持（可用：${allowed.join('/')}）`)
  }
}

/** 按宿主编译器的固定顺序拷注解（description → title → default → examples） */
function copyAnnotations (source, target) {
  for (const key of ANNOTATION_KEYS) if (Object.hasOwn(source, key)) target[key] = source[key]
}

/** 编译一个"值节点"（output.schema 的根 / array 的 items / object 的属性值） */
function compileValueNode (spec, path) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) authorError(`${path} 必须是对象`)
  if (Object.hasOwn(spec, 'oneOf')) authorError(`${path}.oneOf 暂不支持（内置 defineTool 兜底：宿主包不可解析的环境）`)
  const type = Object.hasOwn(spec, 'type') ? spec.type : undefined
  const node = {}
  if (type === 'json') {
    // 「任意 JSON 值」：宿主编译成**仅注解**的节点（无 type），校验走 lossless JSON 那条路
    assertKeys(spec, ['type', ...ANNOTATION_KEYS, 'required'], path)
    copyAnnotations(spec, node)
    return node
  }
  if (type === 'object') {
    assertKeys(spec, ['type', ...ANNOTATION_KEYS, 'properties', 'additionalProperties', 'required'], path)
    if (typeof spec.additionalProperties !== 'boolean') authorError(`${path}.additionalProperties 必须显式写 true/false`)
    node.type = 'object'
    copyAnnotations(spec, node)
    node.additionalProperties = spec.additionalProperties
    if (Object.hasOwn(spec, 'properties')) {
      const compiled = compilePropertyMap(spec.properties, `${path}.properties`)
      node.properties = compiled.properties
      if (compiled.required !== undefined) node.required = compiled.required
    }
    return node
  }
  if (type === 'array') {
    assertKeys(spec, ['type', ...ANNOTATION_KEYS, 'items', 'required'], path)
    node.type = 'array'
    copyAnnotations(spec, node)
    if (Object.hasOwn(spec, 'items')) node.items = compileValueNode(spec.items, `${path}.items`)
    return node
  }
  if (SCALAR_TYPES.has(type)) {
    assertKeys(spec, ['type', ...ANNOTATION_KEYS, 'enum', 'const', 'required'], path)
    node.type = type
    copyAnnotations(spec, node)
    if (Object.hasOwn(spec, 'enum')) {
      if (!Array.isArray(spec.enum)) authorError(`${path}.enum 必须是数组`)
      node.enum = Array.from(spec.enum)
    }
    if (Object.hasOwn(spec, 'const')) node.const = spec.const
    return node
  }
  authorError(`${path}.type 必须是 string/number/integer/boolean/null/array/object/json（拿到 ${JSON.stringify(type)}）`)
}

/**
 * 编译一个属性表（`parameters` 的根 / 嵌套 object 的 properties）。
 * 🔴 属性上的 `required: true` 在这里收进**父级** required（按作者顺序）；属性节点本身不带 required。
 */
function compilePropertyMap (spec, path) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) authorError(`${path} 必须是"属性名 → 值节点"的对象`)
  const properties = {}
  const required = []
  for (const [key, prop] of Object.entries(spec)) {
    if (prop === null || typeof prop !== 'object' || Array.isArray(prop)) authorError(`${path}.${key} 必须是值节点对象`)
    if (Object.hasOwn(prop, 'required') && prop.required !== true) authorError(`${path}.${key}.required 只能是 true`)
    if (prop.required === true) required.push(key)
    properties[key] = compileValueNode(prop, `${path}.${key}`)
  }
  const out = { properties }
  if (required.length > 0) out.required = required
  return out
}

/** `parameters`（属性表）→ 宿主形状的根 schema：`{type:'object', properties[, required]}` */
export function parameterSchemaSpecToJsonSchema (spec) {
  const compiled = compilePropertyMap(spec, 'parameters')
  const schema = { type: 'object', properties: compiled.properties }
  if (compiled.required !== undefined) schema.required = compiled.required
  return schema
}

/** `output.schema`（单值节点）→ 宿主形状的 raw schema */
export function valueSchemaSpecToJsonSchema (spec) {
  return compileValueNode(spec, 'schema')
}

/* ── 入参校验（宿主 validateJsonSchemaValue 的子集，文案/路径逐字对齐） ── */

const diagnosticPath = (path) => (path === '' ? 'arguments' : path)
const propertyPath = (path, key) => (path === '' ? key : `${path}.${key}`)
const losslessViolation = (path) => [`"${diagnosticPath(path)}" must be a lossless JSON value`]

const isJsonNumber = (value) => typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)

function isPlainJsonRecord (value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  } catch { return false }
}

/** 无损 JSON 判定（宿主 isJsonValue 的精简版：覆盖 JSON.parse 产出的形态；Date/函数/NaN/-0/稀疏数组都拒） */
function isLosslessJsonValue (value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return isJsonNumber(value)
  if (typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  let ok = true
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) ok = false
    for (let i = 0; ok && i < value.length; i++) ok = Object.hasOwn(value, i) && isLosslessJsonValue(value[i], seen)
  } else if (isPlainJsonRecord(value)) {
    for (const key of Object.keys(value)) {
      if (!ok) break
      ok = isLosslessJsonValue(value[key], seen)
    }
  } else ok = false
  seen.delete(value)
  return ok
}

const safelyIsJsonValue = (value) => { try { return isLosslessJsonValue(value) } catch { return false } }

function checkScalarValue (node, value, path) {
  if (Object.hasOwn(node, 'enum') && !node.enum.includes(value)) return [`"${diagnosticPath(path)}" must be one of ${JSON.stringify(node.enum)}`]
  if (Object.hasOwn(node, 'const') && value !== node.const) return [`"${diagnosticPath(path)}" must be ${JSON.stringify(node.const)}`]
  return []
}

function checkObjectValue (node, value, path) {
  if (!isPlainJsonRecord(value)) return [`"${diagnosticPath(path)}" must be an object`]
  const properties = Object.hasOwn(node, 'properties') ? (node.properties ?? {}) : {}
  const required = Object.hasOwn(node, 'required') ? (node.required ?? []) : []
  const out = []
  for (const key of required) {
    if (!Object.hasOwn(value, key) || value[key] === undefined) out.push(`missing required property "${propertyPath(path, key)}"`)
  }
  for (const [key, child] of Object.entries(properties)) {
    if (!Object.hasOwn(value, key) || value[key] === undefined) continue
    for (const v of validateJsonSchemaValue(child, value[key], propertyPath(path, key))) out.push(v)
  }
  if (node.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) out.push(`"${propertyPath(path, key)}" is not a declared property (additionalProperties: false)`)
    }
  }
  if (out.length > 0) return out
  return safelyIsJsonValue(value) ? [] : [`"${diagnosticPath(path)}" must be a lossless JSON object`]
}

function checkArrayValue (node, value, path) {
  if (!Array.isArray(value)) return [`"${diagnosticPath(path)}" must be an array`]
  const out = []
  const items = Object.hasOwn(node, 'items') ? node.items : undefined
  if (items !== undefined) {
    for (let i = 0; i < value.length; i++) {
      for (const v of validateJsonSchemaValue(items, value[i], `${path}[${i}]`)) out.push(v)
    }
  }
  if (out.length > 0) return out
  return safelyIsJsonValue(value) ? [] : [`"${diagnosticPath(path)}" must be a dense lossless JSON array`]
}

/**
 * 校验一个值（宿主 validateJsonSchemaValue 的子集；root 调用的 path 用 `''`，报错里会显示成 `"arguments"`）。
 * @returns {string[]} 违规列表（空 = 合法）
 */
export function validateJsonSchemaValue (schema, value, path = '') {
  const nodeType = Object.hasOwn(schema, 'type') ? schema.type : undefined
  if (nodeType === undefined) return safelyIsJsonValue(value) ? [] : losslessViolation(path)
  switch (nodeType) {
    case 'object': return checkObjectValue(schema, value, path)
    case 'array': return checkArrayValue(schema, value, path)
    case 'string':
      return typeof value === 'string' ? checkScalarValue(schema, value, path) : [`"${diagnosticPath(path)}" must be a string`]
    case 'number': {
      if (typeof value !== 'number') return [`"${diagnosticPath(path)}" must be a number`]
      if (!isJsonNumber(value)) return [`"${diagnosticPath(path)}" must be a finite JSON number`]
      return checkScalarValue(schema, value, path)
    }
    case 'integer':
      return !isJsonNumber(value) || !Number.isInteger(value)
        ? [`"${diagnosticPath(path)}" must be an integer`]
        : checkScalarValue(schema, value, path)
    case 'boolean':
      return typeof value === 'boolean' ? checkScalarValue(schema, value, path) : [`"${diagnosticPath(path)}" must be a boolean`]
    case 'null':
      return value === null ? checkScalarValue(schema, value, path) : [`"${diagnosticPath(path)}" must be null`]
    default:
      authorError(`schema.type 不认识：${JSON.stringify(nodeType)}`)
  }
}

/** 内置的入参错误（宿主版是 HarnessError 子类；这里形状对齐但继承不到——见文件头"已知退化"） */
export class BuiltinToolArgsError extends Error {
  constructor (violations) {
    super(`invalid arguments: ${violations.join('; ')}`)
    this.name = 'ToolArgsError'
    this.violations = violations
    this.code = 'INVALID_ARGS'
  }
}

/**
 * 内置 defineTool：照宿主实现组装 `{name, description, parameters, output:{schema, render}, [timeoutMs], execute}`，
 * execute 先校验入参（违规抛 BuiltinToolArgsError）再调用户实现。
 * 宿主支持而这里没用到的 option（finalizeContent / presentCall / presentResult / isConcurrencySafe）**明确抛错** ——
 * 谁将来真要用，自检的"无宿主模拟"会当场红，而不是在两台机器上行为悄悄不同。
 */
export function builtinDefineTool (options) {
  for (const unsupported of ['finalizeContent', 'presentCall', 'presentResult', 'isConcurrencySafe']) {
    if (options[unsupported] !== undefined) authorError(`${unsupported} 暂不支持（内置 defineTool 兜底：宿主包不可解析的环境）`)
  }
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error(`defineTool(${options.name}): timeoutMs must be a positive finite number`)
  }
  const userExecute = options.execute
  const userRender = options.output?.render
  const parameters = parameterSchemaSpecToJsonSchema(options.parameters)
  const outputSchema = valueSchemaSpecToJsonSchema(options.output?.schema)
  const validate = (args) => validateJsonSchemaValue(parameters, args, '')
  const tool = {
    name: options.name,
    description: options.description,
    parameters,
    output: {
      schema: outputSchema,
      render (args, value) { return userRender(args, value) },
    },
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    async execute (args, exec) {
      const violations = validate(args)
      if (violations.length > 0) throw new BuiltinToolArgsError(violations)
      return userExecute(args, exec)
    },
  }
  return tool
}
