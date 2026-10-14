// 데이터베이스 수식 속성 — 작은 식 언어 (eval / new Function 없이 직접 파싱). docs/blocks-schema.md "Relation · Rollup · Formula".
// 지원: prop("이름"), 숫자, "문자열", true/false, + - * /, == != < > <= >=, and/or/not,
//       if(c,a,b) concat(..) length(x) round(x[,자리]) abs min max dateBetween(a,b,"days") now() empty(x)
// 값: number · string · boolean · Date · null. 순수 함수, DOM 없음 (워커도 쓸 수 있게).

export class FormulaError extends Error {}
const err = (m) => { throw new FormulaError(m); };

function lex(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i)); if (!m) err("숫자가 이상해요"); out.push({ t: "num", v: Number(m[0]) }); i += m[0].length; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== c) { if (src[j] === "\\" && j + 1 < src.length) j++; s += src[j++]; }
      if (j >= src.length) err("따옴표가 닫히지 않았어요"); out.push({ t: "str", v: s }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) { const m = /^[A-Za-z_]\w*/.exec(src.slice(i)); out.push({ t: "id", v: m[0] }); i += m[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/<>(),!%".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    err(`모르는 글자: ${c}`);
  }
  return out;
}

// 재귀 하강 파서 → AST
export function parseFormula(src) {
  if (typeof src !== "string" || !src.trim()) err("식이 비어 있어요");
  if (src.length > 1000) err("식이 너무 길어요");
  const tk = lex(src); let k = 0, depth = 0;
  const peek = () => tk[k], isOp = (v) => tk[k]?.t === "op" && tk[k].v === v;
  const eat = (v) => { if (!isOp(v)) err(`'${v}' 가 필요해요`); k++; };
  const bin = (next, ops) => () => { let a = next(); while (tk[k]?.t === "op" && ops.includes(tk[k].v) || (tk[k]?.t === "id" && ops.includes(tk[k].v))) { const op = tk[k++].v; a = { op, a, b: next() }; } return a; };
  const unary = () => {
    if (++depth > 60) err("식이 너무 깊어요");
    try {
      if (isOp("-")) { k++; return { op: "neg", a: unary() }; }
      if (isOp("!") || (peek()?.t === "id" && peek().v === "not" && tk[k + 1]?.v !== "(")) { k++; return { op: "not", a: unary() }; }
      return primary();
    } finally { depth--; }
  };
  const mul = bin(unary, ["*", "/", "%"]), add = bin(mul, ["+", "-"]);
  const cmp = bin(add, ["==", "!=", "<", ">", "<=", ">="]);
  const and = bin(cmp, ["and", "&&"]), or = bin(and, ["or", "||"]);
  function primary() {
    const t = tk[k++];
    if (!t) err("식이 덜 끝났어요");
    if (t.t === "num" || t.t === "str") return { lit: t.v };
    if (t.t === "op" && t.v === "(") { const e = or(); eat(")"); return e; }
    if (t.t === "id") {
      if (t.v === "true" || t.v === "false") return { lit: t.v === "true" };
      if (!isOp("(")) err(`'${t.v}' 다음에 ( 가 필요해요`);
      k++; const args = [];
      if (!isOp(")")) { do args.push(or()); while (isOp(",") && ++k); }
      eat(")");
      if (!(t.v in FN)) err(`모르는 함수: ${t.v}()`);
      if (t.v === "prop" && (args.length !== 1 || typeof args[0].lit !== "string")) err('prop("이름") 처럼 써 주세요');
      return { fn: t.v, args };
    }
    err(`'${t.v}' 가 여기 올 수 없어요`);
  }
  const ast = or();
  if (k < tk.length) err(`'${tk[k].v}' 가 남았어요`);
  return ast;
}

const DAY = 864e5;
const isDate = (v) => v instanceof Date;
const num = (v) => (isDate(v) ? v.getTime() : typeof v === "boolean" ? +v : v === null || v === "" ? 0 : Number(v));
export const fmtValue = (v) => (v === null || v === undefined ? "" : isDate(v) ? v.toISOString().slice(0, 10) : typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "") : typeof v === "boolean" ? (v ? "true" : "false") : String(v));
export const toDate = (v) => { if (isDate(v)) return v; const d = new Date(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T00:00:00Z" : v); if (isNaN(d)) err("날짜가 아니에요"); return d; };
const UNITS = { minutes: 6e4, hours: 36e5, days: DAY, weeks: 7 * DAY };
const FN = {
  prop: null, // 따로 처리
  if: (c, a, b) => (truthy(c) ? a : b),
  concat: (...a) => a.map(fmtValue).join(""),
  length: (x) => (Array.isArray(x) ? x.length : fmtValue(x).length),
  round: (x, d = 0) => { const p = 10 ** num(d); return Math.round(num(x) * p) / p; },
  abs: (x) => Math.abs(num(x)),
  min: (...a) => Math.min(...a.map(num)), max: (...a) => Math.max(...a.map(num)),
  not: (x) => !truthy(x),
  empty: (x) => x === null || x === undefined || x === "" || (Array.isArray(x) && !x.length),
  now: () => new Date(),
  dateBetween: (a, b, unit = "days") => {
    const x = toDate(a), y = toDate(b), u = String(unit);
    if (u === "months" || u === "years") { const m = (x.getUTCFullYear() - y.getUTCFullYear()) * 12 + x.getUTCMonth() - y.getUTCMonth() - (x.getUTCDate() < y.getUTCDate() ? 1 : 0); return u === "years" ? Math.trunc(m / 12) : m; }
    if (!UNITS[u]) err(`dateBetween 단위는 minutes/hours/days/weeks/months/years 예요`);
    return Math.trunc((x - y) / UNITS[u]);
  },
};
const truthy = (v) => !(v === null || v === undefined || v === false || v === 0 || v === "" || (Array.isArray(v) && !v.length));
const eq = (a, b) => (isDate(a) || isDate(b) ? num(a) === num(b) : typeof a === "number" || typeof b === "number" ? num(a) === num(b) : fmtValue(a) === fmtValue(b));

// ast 를 계산. getProp(name) → 값 (없는 이름이면 FormulaError 를 던져요)
export function evalFormula(ast, getProp) {
  const ev = (n) => {
    if ("lit" in n) return n.lit;
    if (n.fn === "prop") return getProp(n.args[0].lit);
    if (n.fn === "if") { if (n.args.length !== 3) err("if(조건, 참, 거짓) 처럼 써 주세요"); return truthy(ev(n.args[0])) ? ev(n.args[1]) : ev(n.args[2]); }
    if (n.fn) return FN[n.fn](...n.args.map(ev));
    if (n.op === "neg") return -num(ev(n.a));
    if (n.op === "not") return !truthy(ev(n.a));
    if (n.op === "and" || n.op === "&&") return truthy(ev(n.a)) && truthy(ev(n.b));
    if (n.op === "or" || n.op === "||") return truthy(ev(n.a)) || truthy(ev(n.b));
    const a = ev(n.a), b = ev(n.b);
    switch (n.op) {
      case "+": return typeof a === "string" || typeof b === "string" ? fmtValue(a) + fmtValue(b) : num(a) + num(b);
      case "-": return num(a) - num(b);
      case "*": return num(a) * num(b);
      case "/": { const d = num(b); if (d === 0) err("0 으로 나눌 수 없어요"); return num(a) / d; }
      case "%": return num(a) % num(b);
      case "==": return eq(a, b);
      case "!=": return !eq(a, b);
    }
    const x = typeof a === "string" && typeof b === "string" ? a : num(a), y = typeof a === "string" && typeof b === "string" ? b : num(b);
    return n.op === "<" ? x < y : n.op === ">" ? x > y : n.op === "<=" ? x <= y : x >= y;
  };
  const v = ev(ast);
  if (typeof v === "number" && !Number.isFinite(v)) err("숫자가 아니에요");
  return v;
}

const cache = new Map();
export function compile(expr) {
  if (cache.has(expr)) return cache.get(expr);
  let c; try { c = { ast: parseFormula(expr) }; } catch (e) { c = { error: e instanceof FormulaError ? e.message : "식을 읽지 못했어요" }; }
  if (cache.size > 300) cache.clear();
  cache.set(expr, c); return c;
}
