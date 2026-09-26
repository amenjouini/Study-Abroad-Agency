import { CurrencyMismatchError, isMoney } from "../money";
import type { RuleCondition, RuleNode } from "./types";

export interface RuleEnv {
  context: Record<string, unknown>;
  params: Record<string, unknown>;
}

export class RuleReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleReferenceError";
  }
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      // Project the property over arrays: student.degreeLevels or sponsors.relationship
      cur = cur.map((item) => (item as Record<string, unknown>)?.[part]);
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function resolveValue(value: unknown, env: RuleEnv): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, env));
  if (value && typeof value === "object") {
    const ref = value as Record<string, unknown>;
    if ("$param" in ref) {
      const key = String(ref.$param);
      if (!(key in env.params)) throw new RuleReferenceError(`Unknown procedure parameter: ${key}`);
      return env.params[key];
    }
    if ("$field" in ref) return getPath(env.context, String(ref.$field));
  }
  return value;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function isDateString(v: unknown): v is string {
  return typeof v === "string" && ISO_DATE.test(v);
}

function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (isMoney(a) && isMoney(b)) return a.currency === b.currency && a.amountMinor === b.amountMinor;
  if (isDateString(a) && isDateString(b)) return a.slice(0, 10) === b.slice(0, 10);
  return a === b;
}

/** Ordering for numbers, money (same currency only) and ISO dates. Returns null when not comparable. */
function order(a: unknown, b: unknown): number | null {
  if (isMoney(a) && isMoney(b)) {
    if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
    return Math.sign(a.amountMinor - b.amountMinor);
  }
  if (typeof a === "number" && typeof b === "number") return Math.sign(a - b);
  if (isDateString(a) && isDateString(b)) {
    const x = a.slice(0, 10);
    const y = b.slice(0, 10);
    return x === y ? 0 : x < y ? -1 : 1;
  }
  return null;
}

function includes(list: unknown[], actual: unknown): boolean {
  if (Array.isArray(actual)) return actual.some((a) => list.some((l) => looseEquals(a, l)));
  return list.some((l) => looseEquals(actual, l));
}

export function evaluateCondition(cond: RuleCondition, env: RuleEnv): boolean {
  const actual = getPath(env.context, cond.field);
  const expected = resolveValue(cond.value, env);
  switch (cond.operator) {
    case "exists":
      return isPresent(actual);
    case "not_exists":
      return !isPresent(actual);
    case "equals":
      return isPresent(actual) && looseEquals(actual, expected);
    case "not_equals":
      return !isPresent(actual) || !looseEquals(actual, expected);
    case "in": {
      if (!Array.isArray(expected)) throw new RuleReferenceError(`Operator "in" needs a list (${cond.field})`);
      return isPresent(actual) && includes(expected, actual);
    }
    case "not_in": {
      if (!Array.isArray(expected)) throw new RuleReferenceError(`Operator "not_in" needs a list (${cond.field})`);
      return !isPresent(actual) || !includes(expected, actual);
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "before":
    case "after": {
      if (!isPresent(actual)) return false;
      const c = order(actual, expected);
      if (c === null) return false;
      if (cond.operator === "gt" || cond.operator === "after") return c > 0;
      if (cond.operator === "gte") return c >= 0;
      if (cond.operator === "lt" || cond.operator === "before") return c < 0;
      return c <= 0;
    }
    case "between": {
      if (!Array.isArray(expected) || expected.length !== 2) {
        throw new RuleReferenceError(`Operator "between" needs [min, max] (${cond.field})`);
      }
      if (!isPresent(actual)) return false;
      const lo = order(actual, expected[0]);
      const hi = order(actual, expected[1]);
      return lo !== null && hi !== null && lo >= 0 && hi <= 0;
    }
  }
}

/** AND / OR / NOT groups. NOT negates the conjunction of its children. Empty AND is true, empty OR false. */
export function evaluateRule(node: RuleNode | null | undefined, env: RuleEnv): boolean {
  if (!node) return true;
  if (node.type === "condition") return evaluateCondition(node, env);
  switch (node.operator) {
    case "AND":
      return node.children.every((c) => evaluateRule(c, env));
    case "OR":
      return node.children.some((c) => evaluateRule(c, env));
    case "NOT":
      return !node.children.every((c) => evaluateRule(c, env));
  }
}
