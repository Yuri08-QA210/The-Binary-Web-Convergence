// ============================================
// SSTI Template Engine - Jinja2-like for CTF
// Supports basic Jinja2 syntax with filter chain
// ============================================

import { db } from "./db";
import { CTF_CONFIG } from "./ctf-config";

// Template context objects available to the SSTI engine
export interface TemplateContext {
  request: {
    args: Record<string, string>;
    method: string;
    path: string;
    headers: Record<string, string>;
  };
  config: Record<string, unknown>;
  db: SSTIDBProxy;
  lipsum: LipsumProxy;
  range: (start: number, end?: number, step?: number) => number[];
  dict: (...args: unknown[]) => Record<string, unknown>;
  namespace: (...args: unknown[]) => Record<string, unknown>;
  cycler: (...args: unknown[]) => unknown;
  joiner: (...args: unknown[]) => unknown;
}

// DB proxy for SSTI exploitation
class SSTIDBProxy {
  user: UserProxy;
  session: SessionProxy;

  constructor() {
    this.user = new UserProxy();
    this.session = new SessionProxy();
  }

  toString() {
    return "[object DatabaseProxy]";
  }
}

class UserProxy {
  async update(whereData: Record<string, unknown>, dataData: Record<string, unknown>) {
    try {
      const result = await db.user.update({
        where: whereData as any,
        data: dataData as any,
      });
      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // Simple admin elevation - accessible via SSTI
  // Call: db.user.elevate(uuid) or db.user.elevate(email)
  async elevate(identifier: string) {
    try {
      // Try by uuid first, then by email
      let result;
      try {
        result = await db.user.update({
          where: { uuid: identifier },
          data: { is_admin: true },
        });
      } catch {
        // If uuid doesn't work, find by email and use id
        const user = await db.user.findFirst({ where: { email: identifier } });
        if (!user) return { success: false, error: "User not found" };
        result = await db.user.update({
          where: { id: user.id },
          data: { is_admin: true },
        });
      }
      return { success: true, data: { ...result, isAdmin: result.is_admin } };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // Set a field by email/uuid
  // Call: db.user.setField(identifier, field, value)
  async setField(identifier: string, field: string, value: unknown) {
    try {
      let result;
      try {
        result = await db.user.update({
          where: { uuid: identifier },
          data: { [field]: value },
        });
      } catch {
        const user = await db.user.findFirst({ where: { email: identifier } });
        if (!user) return { success: false, error: "User not found" };
        result = await db.user.update({
          where: { id: user.id },
          data: { [field]: value },
        });
      }
      return { success: true, data: { ...result, isAdmin: result.is_admin } };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async findFirst(args: Record<string, unknown>) {
    try {
      const result = await db.user.findFirst(args as any);
      return result;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async findMany(args?: Record<string, unknown>) {
    try {
      const result = await db.user.findMany(args as any);
      return result;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  toString() {
    return "[object UserProxy]";
  }
}

class SessionProxy {
  async update(whereData: Record<string, unknown>, dataData: Record<string, unknown>) {
    try {
      const result = await db.session.update({
        where: whereData as any,
        data: dataData as any,
      });
      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  toString() {
    return "[object SessionProxy]";
  }
}

// Lipsum proxy - Jinja2's lipsum generator
class LipsumProxy {
  generate(paragraphs: number = 1): string {
    const lorem =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
      "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. " +
      "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.";
    return Array(paragraphs).fill(lorem).join("\n\n");
  }

  toString() {
    return this.generate(1);
  }
}

// ---- Template Parser ----

export function createTemplateContext(
  urlParams: Record<string, string>,
  method: string = "POST",
  path: string = "/debug/console"
): TemplateContext {
  return {
    request: {
      args: urlParams,
      method,
      path,
      headers: {},
    },
    config: {
      SECRET_KEY: CTF_CONFIG.APP_SECRET_KEY,
      DEBUG: false,
      DATABASE_URL: "sqlite:./dev.db",
      ALLOWED_HOSTS: ["*"],
    },
    db: new SSTIDBProxy(),
    lipsum: new LipsumProxy(),
    range: (start: number, end?: number, step?: number) => {
      if (end === undefined) {
        return Array.from({ length: start }, (_, i) => i);
      }
      const s = step || 1;
      return Array.from(
        { length: Math.ceil((end - start) / s) },
        (_, i) => start + i * s
      );
    },
    dict: (...args: unknown[]) => {
      const result: Record<string, unknown> = {};
      args.forEach((arg) => {
        if (typeof arg === "object" && arg !== null) {
          Object.assign(result, arg);
        }
      });
      return result;
    },
    namespace: (...args: unknown[]) => {
      return { ...args };
    },
    cycler: (...args: unknown[]) => {
      let index = 0;
      return {
        next: () => args[index++ % args.length],
        reset: () => { index = 0; },
        current: () => args[index],
      };
    },
    joiner: (...args: unknown[]) => {
      let first = true;
      return () => {
        if (first) { first = false; return ""; }
        return ", ";
      };
    },
  };
}

// Evaluate a template expression
export async function evaluateTemplate(
  template: string,
  context: TemplateContext
): Promise<{ output: string; error?: string; adminSet?: boolean }> {
  try {
    const variables: Record<string, unknown> = {};
    let output = "";
    let adminSet = false;

    // Process {% set var = expr %} statements
    const setRegex = /\{%\s*set\s+(\w+)\s*=\s*(.+?)\s*%\}/g;
    let match;

    const setStatements: { varName: string; expr: string }[] = [];
    let processedTemplate = template;

    while ((match = setRegex.exec(template)) !== null) {
      setStatements.push({ varName: match[1], expr: match[2] });
      processedTemplate = processedTemplate.replace(match[0], "");
    }

    // Evaluate each set statement
    for (const stmt of setStatements) {
      try {
        const value = await evaluateExpression(stmt.expr, context, variables);
        variables[stmt.varName] = value;

        // Check if admin was set
        if (
          value !== null &&
          typeof value === "object" &&
          "success" in (value as Record<string, unknown>) &&
          (value as Record<string, unknown>).success === true
        ) {
          const data = (value as Record<string, unknown>).data;
          if (data && typeof data === "object" && "isAdmin" in (data as Record<string, unknown>) && (data as Record<string, unknown>).isAdmin === true) {
            adminSet = true;
          }
        }
      } catch (e: any) {
        output += `[Error evaluating ${stmt.varName}: ${e.message}]\n`;
      }
    }

    // Process remaining template output - {{ expr }}
    const exprRegex = /\{\{\s*(.+?)\s*\}\}/g;
    processedTemplate = processedTemplate.replace(
      exprRegex,
      (_, expr) => {
        try {
          const result = evaluateExpressionSync(expr, context, variables);
          return String(result);
        } catch (e: any) {
          return `[Error: ${e.message}]`;
        }
      }
    );

    output += processedTemplate.trim();

    return { output, adminSet };
  } catch (e: any) {
    return { output: "", error: e.message };
  }
}

// ---- Expression Evaluation ----

async function evaluateExpression(
  expr: string,
  context: TemplateContext,
  variables: Record<string, unknown>
): Promise<unknown> {
  const scope: Record<string, unknown> = { ...context, ...variables };
  return resolveValue(expr.trim(), scope, context, true);
}

function evaluateExpressionSync(
  expr: string,
  context: TemplateContext,
  variables: Record<string, unknown>
): unknown {
  const scope: Record<string, unknown> = { ...context, ...variables };
  return resolveValue(expr.trim(), scope, context, false);
}

// Main expression resolver - handles dotted access, filters, function calls
function resolveValue(
  expr: string,
  scope: Record<string, unknown>,
  context: TemplateContext,
  isAsync: boolean
): unknown {
  if (!expr) return undefined;

  // Split by | but respect parentheses (don't split inside parens)
  const parts = splitByPipe(expr);
  
  // First part is the base value
  let value = resolveBaseValue(parts[0].trim(), scope, context, isAsync);

  // Apply remaining parts as filters
  for (let i = 1; i < parts.length; i++) {
    const filterPart = parts[i].trim();
    value = applyFilter(value, filterPart, scope, context, isAsync);
  }

  return value;
}

// Split expression by | but not inside parentheses
function splitByPipe(expr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (const ch of expr) {
    if (inString) {
      current += ch;
      if (ch === stringChar) inString = false;
    } else if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      current += ch;
    } else if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Resolve base value - identifier with dotted access and function calls
function resolveBaseValue(
  expr: string,
  scope: Record<string, unknown>,
  context: TemplateContext,
  isAsync: boolean
): unknown {
  // Handle function call syntax: identifier(args)
  // Parse: name.part.method(args)
  const funcMatch = expr.match(/^([\w.]+)\(([^)]*)\)$/);
  if (funcMatch) {
    const basePath = funcMatch[1];
    const argsStr = funcMatch[2];
    
    // Resolve the function object
    const func = resolveDottedPath(basePath, scope);
    if (typeof func === "function") {
      const args = parseAndResolveArgs(argsStr, scope, context, isAsync);
      return isAsync ? func(...args) : func(...args);
    }
    return undefined;
  }

  // Handle simple dotted path
  return resolveDottedPath(expr, scope);
}

// Resolve a dotted path like "request.args.a"
function resolveDottedPath(path: string, scope: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = scope;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

// Parse and resolve function arguments
function parseAndResolveArgs(
  argsStr: string,
  scope: Record<string, unknown>,
  context: TemplateContext,
  isAsync: boolean
): unknown[] {
  if (!argsStr.trim()) return [];

  const args: unknown[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (const ch of argsStr) {
    if (inString) {
      current += ch;
      if (ch === stringChar) inString = false;
    } else if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      current += ch;
    } else if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      args.push(resolveArgValue(current.trim(), scope, context, isAsync));
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    args.push(resolveArgValue(current.trim(), scope, context, isAsync));
  }

  return args;
}

// Resolve a single argument value
function resolveArgValue(
  arg: string,
  scope: Record<string, unknown>,
  context: TemplateContext,
  isAsync: boolean
): unknown {
  // String literal
  if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
    return arg.slice(1, -1);
  }

  // Number literal
  if (/^-?\d+$/.test(arg)) return parseInt(arg, 10);
  if (/^-?\d+\.\d+$/.test(arg)) return parseFloat(arg);

  // Boolean/Null
  if (arg === "true") return true;
  if (arg === "false") return false;
  if (arg === "none" || arg === "null") return null;

  // If it contains | or (, it's a complex expression
  if (arg.includes("|") || arg.includes("(")) {
    return resolveValue(arg, scope, context, isAsync);
  }

  // Simple dotted identifier
  return resolveDottedPath(arg, scope);
}

// Apply a Jinja2-like filter
function applyFilter(
  input: unknown,
  filterExpr: string,
  scope: Record<string, unknown>,
  context: TemplateContext,
  isAsync: boolean
): unknown {
  // Parse filter name and arguments: filtername(args)
  const match = filterExpr.match(/^(\w+)(?:\((.+)\))?$/);
  if (!match) return input;

  const filterName = match[1];
  const argsStr = match[2] || "";

  // Parse arguments
  const args = parseAndResolveArgs(argsStr, scope, context, isAsync);

  switch (filterName) {
    case "attr": {
      const attrName = String(args[0]);
      if (input === null || input === undefined) return undefined;
      if (typeof input === "object") {
        const val = (input as Record<string, unknown>)[attrName];
        // If the attribute is a function, return it as-is so it can be called
        return val;
      }
      return undefined;
    }

    case "string":
      return String(input);

    case "list":
      if (typeof input === "string") return input.split("");
      if (Array.isArray(input)) return input;
      return [input];

    case "join":
      if (Array.isArray(input)) {
        const separator = args[0] || "";
        return input.join(String(separator));
      }
      return String(input);

    case "length":
      if (typeof input === "string") return input.length;
      if (Array.isArray(input)) return input.length;
      if (typeof input === "object" && input !== null) return Object.keys(input).length;
      return 0;

    case "first":
      if (Array.isArray(input)) return input[0];
      if (typeof input === "string") return input[0];
      return input;

    case "last":
      if (Array.isArray(input)) return input[input.length - 1];
      return input;

    case "reverse":
      if (typeof input === "string") return input.split("").reverse().join("");
      if (Array.isArray(input)) return [...input].reverse();
      return input;

    case "sort":
      if (Array.isArray(input)) return [...input].sort();
      return input;

    case "map": {
      const attr = String(args[0]);
      if (Array.isArray(input)) {
        return input.map((item) => {
          if (typeof item === "object" && item !== null) {
            return (item as Record<string, unknown>)[attr];
          }
          return item;
        });
      }
      return input;
    }

    case "select": {
      const attr = String(args[0]);
      if (Array.isArray(input)) {
        return input.filter((item) => {
          if (typeof item === "object" && item !== null) {
            return !!(item as Record<string, unknown>)[attr];
          }
          return false;
        });
      }
      return input;
    }

    case "int":
      return parseInt(String(input), 10);

    case "float":
      return parseFloat(String(input));

    case "lower":
      return String(input).toLowerCase();

    case "upper":
      return String(input).toUpperCase();

    case "trim":
      return String(input).trim();

    case "replace": {
      const old = String(args[0]);
      const newStr = String(args[1] || "");
      return String(input).replaceAll(old, newStr);
    }

    case "batch": {
      const size = Number(args[0]) || 1;
      if (Array.isArray(input)) {
        const result: unknown[][] = [];
        for (let i = 0; i < input.length; i += size) {
          result.push(input.slice(i, i + size));
        }
        return result;
      }
      return input;
    }

    case "get": {
      const key = args[0];
      if (typeof input === "object" && input !== null) {
        return (input as Record<string, unknown>)[String(key)] ?? args[1];
      }
      return args[1] || undefined;
    }

    case "default":
    case "d":
      if (input === null || input === undefined) return args[0];
      return input;

    default:
      return input;
  }
}
