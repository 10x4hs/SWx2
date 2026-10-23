// 뜻으로 찾기 색인 채우기 — CIM 19장을 차례로 색인하고, 남은 임베딩을 끝까지 돌려요 (관리자 API /api/rag/*).
//   로컬:  BASE=http://127.0.0.1:8797 node scripts/rag-index.mjs            (임시 관리자를 만들었다가 지워요 · PASSWORDLESS=1)
//   배포본: BASE=https://swx2.swx2.workers.dev COOKIE='trio_session=…' node scripts/rag-index.mjs   (관리자 로그인 쿠키)
//   --force 면 지문이 같아도 다시 써요. 배포본은 이걸 안 돌려도 매시 크론이 천천히 채워요 (src/rag.js ragCron).
import { adminSession } from "./lib/rag-admin.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8797";
const force = process.argv.includes("--force");
const { call, done } = await adminSession(BASE);
try {
  const CH = ["s1c1", "s1c2", "s1c3", "s2c1", "s2c2", "s2c3", "s2c4", "s2c5", "s2c6", "s3c1", "s3c2", "s3c3", "s3c4", "s3c5", "s3c6", "s3c7", "s3c8", "s3c9", "s3c10"];
  let neurons = 0;
  for (const ch of CH) {
    const r = await call("POST", `/rag/index/cim?ch=${ch}${force ? "&force=1" : ""}`);
    if (r.status !== 200) throw new Error(`${ch}: ${r.status} ${JSON.stringify(r.data)}`);
    neurons += r.data.embed?.neurons || 0;
    console.log(ch, JSON.stringify(r.data.sync), "embed", JSON.stringify(r.data.embed));
  }
  for (let i = 0; i < 30; i++) {
    const s = await call("GET", "/rag/status");
    const pending = s.data.chunks.filter((c) => c.vec_state === "pending" || c.vec_state === "error").reduce((n, c) => n + c.n, 0);
    if (!pending) break;
    const r = await call("POST", "/rag/index/step");
    neurons += r.data.embed?.neurons || 0;
    console.log("step", JSON.stringify(r.data.embed));
  }
  const s = await call("GET", "/rag/status");
  console.log("status", JSON.stringify(s.data.chunks), "neurons today ≈", s.data.neurons_today, "(this run ≈", Math.round(neurons * 100) / 100, ")");
} finally { await done(); }
