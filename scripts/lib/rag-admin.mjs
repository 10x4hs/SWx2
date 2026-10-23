// rag-index · rag-eval 이 같이 쓰는 관리자 세션.
//   COOKIE 가 있으면 그 쿠키로 (배포본), 없으면 로컬(PASSWORDLESS=1)에 임시 관리자를 만들어 아이디로 로그인하고 done() 때 지워요.
import { execFileSync } from "node:child_process";

const d1 = (sql) => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", sql], { stdio: "ignore" });

export async function adminSession(BASE, { keep = false } = {}) {
  let cookie = process.env.COOKIE || "", temp = null;
  if (!cookie) {
    temp = "rag_" + Date.now().toString(36).slice(-6);
    execFileSync("node", ["scripts/add-user.mjs", temp, "RAG평가", "--features=all"], { stdio: "ignore" });
    d1(`UPDATE users SET role = 'admin' WHERE username = '${temp}'`);
    const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-trio": "1" }, body: JSON.stringify({ username: temp }) });
    if (r.status !== 200) throw new Error("local login failed " + r.status);
    cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  }
  const call = async (method, path, body) => {
    const r = await fetch(BASE + "/api" + path, { method, headers: { "content-type": "application/json", "x-trio": "1", cookie }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const done = async () => { if (temp && !keep) d1(`DELETE FROM users WHERE username = '${temp}'`); };
  return { call, done, user: temp };
}
