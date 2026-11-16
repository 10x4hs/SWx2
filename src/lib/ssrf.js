// 서버가 대신 여는 바깥 주소(SSRF) 검사 — 내장 브라우저 프록시(src/proxy.js) · AI 의 페이지 읽기(src/agent.js readPage) · 링크 저장(src/library.js)이 같이 써요.
// 열 때는 safeFetch 로: 리디렉트를 직접 따라가며 주소마다 같은 검사를 해요 (바깥 주소가 302 로 내부 주소로 넘기는 것까지 막게).
// Workers 는 DNS 를 못 풀어서 호스트 이름 문자열로만 막아요: localhost · 사설/링크로컬/공유 IPv4 · 루프백/ULA/링크로컬 IPv6 · 클라우드 메타데이터 이름.
// new URL() 이 IPv4 다른 꼴(2130706433 · 0x7f.1 · 017.1)을 a.b.c.d 로, IPv6 을 [소문자 축약] 으로 정리해 주니 정리된 hostname 만 봐요.
const META = new Set(["metadata", "instance-data", "metadata.azure.com"]); // metadata.google.internal 은 .internal 로 막혀요

function privateV4(a, b, c) {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) || a >= 224; // 공유(CGNAT · 클라우드 메타데이터) · 특수(192.0.0/24 · 192.0.2/24) · 멀티캐스트/예약
}
function privateV6(h) {
  if (h === "::" || h === "::1") return true;
  // IPv4 를 품은 IPv6 (::ffff:7f00:1 · ::ffff:127.0.0.1) → 그 IPv4 로 판단
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h), dot = /^::ffff:(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(h);
  if (hex) { const hi = parseInt(hex[1], 16); return privateV4(hi >> 8, hi & 255, parseInt(hex[2], 16) >> 8); }
  if (dot) return privateV4(+dot[1], +dot[2], +dot[3]);
  if (h.startsWith("::")) return true; // 그 밖의 ::x (예전 IPv4 호환 꼴) — 바깥 주소로 쓸 일이 없어요
  if (h.startsWith("64:ff9b:")) return true; // NAT64 — 안의 IPv4 를 숨길 수 있어요
  const f = parseInt(h.split(":")[0], 16);
  return (f & 0xfe00) === 0xfc00 || (f & 0xffc0) === 0xfe80 || (f & 0xff00) === 0xff00; // ULA fc00::/7 · 링크로컬 fe80::/10 · 멀티캐스트
}
export function privateHost(host) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h.startsWith("[")) return privateV6(h.slice(1, -1));
  if (h.includes(":")) return privateV6(h); // 괄호 없이 온 IPv6
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa") || META.has(h)) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  return v4 ? privateV4(+v4[1], +v4[2], +v4[3]) : false;
}
// http(s) 이고 사설 주소가 아니면 URL, 아니면 null. selfHost: 우리 서버 자신도 막을 때
export function publicUrl(raw, selfHost = null) {
  let u;
  try { u = raw instanceof URL ? raw : new URL(String(raw || "").trim()); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (privateHost(u.hostname) || (selfHost && u.hostname.toLowerCase() === String(selfHost).toLowerCase())) return null;
  return u;
}

// fetch 대신: 첫 주소와 리디렉트마다 publicUrl 검사. 막히면 throw. 돌려주는 Response 의 url 은 마지막 주소예요
export async function safeFetch(url, init = {}, selfHost = null, hops = 5) {
  let at = publicUrl(url, selfHost);
  if (!at) throw new Error("이 주소는 열 수 없어요 (내부 · 사설 주소).");
  for (let i = 0; ; i++) {
    const res = await fetch(at.href, { ...init, redirect: "manual" });
    const loc = res.status >= 300 && res.status < 400 && res.headers.get("location");
    if (!loc) return res;
    try { await res.body?.cancel(); } catch {}
    if (i >= hops) throw new Error("리디렉트가 너무 많아요.");
    at = publicUrl(new URL(loc, at).href, selfHost);
    if (!at) throw new Error("이 주소는 열 수 없어요 (내부 · 사설 주소로 넘어가요).");
  }
}
