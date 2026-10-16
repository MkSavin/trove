// A JSON Schema validator for the keywords the generated config schema uses; any other keyword throws.
type Schema = {
  type?: string;
  const?: unknown;
  enum?: readonly unknown[];
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: Schema | false;
  propertyNames?: Schema;
  items?: Schema;
  minItems?: number;
  anyOf?: readonly Schema[];
  pattern?: string;
  exclusiveMinimum?: number;
  minimum?: number;
  maximum?: number;
};

const ANNOTATIONS = new Set(["$schema", "$id", "title", "description", "default", "format"]);
const KEYWORDS = new Set([
  "type",
  "const",
  "enum",
  "properties",
  "required",
  "additionalProperties",
  "propertyNames",
  "items",
  "minItems",
  "anyOf",
  "pattern",
  "exclusiveMinimum",
  "minimum",
  "maximum",
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const typeMatches = (type: string, value: unknown): boolean => {
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "null") return value === null;
  return typeof value === type;
};

const objectProblems = (schema: Schema, value: Record<string, unknown>, at: string): string[] => [
  ...(schema.required ?? []).filter((key) => !(key in value)).map((key) => `${at}.${key}: missing`),
  ...Object.entries(value).flatMap(([key, item]) => {
    const own = schema.properties?.[key];
    const names = schema.propertyNames ? validate(schema.propertyNames, key, `${at}.${key}`) : [];
    if (own) return [...names, ...validate(own, item, `${at}.${key}`)];
    if (schema.additionalProperties === false) return [`${at}.${key}: not allowed`];
    if (schema.additionalProperties) {
      return [...names, ...validate(schema.additionalProperties, item, `${at}.${key}`)];
    }
    return names;
  }),
];

export const validate = (schema: Schema, value: unknown, at = "$"): string[] => {
  const unknown = Object.keys(schema).filter((key) => !ANNOTATIONS.has(key) && !KEYWORDS.has(key));
  if (unknown.length > 0) throw new Error(`${at}: unsupported keywords ${unknown.join(", ")}`);

  if (schema.anyOf && !schema.anyOf.some((option) => validate(option, value, at).length === 0)) {
    return [`${at}: matches none of anyOf`];
  }
  if (schema.type && !typeMatches(schema.type, value)) return [`${at}: not ${schema.type}`];
  if ("const" in schema && value !== schema.const) return [`${at}: not ${String(schema.const)}`];
  if (schema.enum && !schema.enum.includes(value)) return [`${at}: not one of ${schema.enum}`];

  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    return [`${at}: does not match ${schema.pattern}`];
  }
  if (typeof value === "number") {
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
      return [`${at}: too small`];
    if (schema.minimum !== undefined && value < schema.minimum) return [`${at}: too small`];
    if (schema.maximum !== undefined && value > schema.maximum) return [`${at}: too large`];
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      return [`${at}: fewer than ${schema.minItems} items`];
    }
    const items = schema.items;
    return items ? value.flatMap((item, i) => validate(items, item, `${at}[${i}]`)) : [];
  }
  return isObject(value) ? objectProblems(schema, value, at) : [];
};
