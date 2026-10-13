// Dock 아이콘 우클릭 → Customize: 화면마다 내 CSS · HTML · JS 를 덮어씌우고, Rename & icon 으로 이름 · 아이콘도 바꿔요. 본인만, 원본 파일은 그대로.
import { fail, json, body, now } from "./http.js";

const SLOT_RE = /^(nav:[a-z-]{1,20}|ui:[a-z-]{1,20}|page:[A-Za-z0-9-]{1,64})$/;
const MAX = 200_000; // 칸마다

export function registerCustom(on) {
  on("GET", "/custom", async ({ env, user }) => {
    const { results } = await env.DB.prepare("SELECT slot, css, html, js, label, icon, updated_at FROM view_custom WHERE user_id = ?").bind(user.id).all();
    return json({ custom: results });
  });

  on("PUT", "/custom/:slot", async ({ req, env, user, params }) => {
    const slot = decodeURIComponent(params.slot);
    if (!SLOT_RE.test(slot)) fail(400, "Unknown slot.");
    const b = await body(req);
    const f = (k) => { const v = typeof b[k] === "string" ? b[k] : ""; if (v.length > MAX) fail(400, `${k.toUpperCase()} is too long.`); return v; };
    const css = f("css"), html = f("html"), js = f("js");
    const label = String(b.label || "").trim().slice(0, 40) || null;
    const icon = /^(app:[a-z-]{1,20}|emoji:.{1,16}|url:https:\/\/\S{1,480})$/u.test(String(b.icon || "")) ? String(b.icon) : null;
    if (!css.trim() && !html.trim() && !js.trim() && !label && !icon) {
      await env.DB.prepare("DELETE FROM view_custom WHERE user_id = ? AND slot = ?").bind(user.id, slot).run();
      return json({ custom: null });
    }
    const at = now();
    await env.DB.prepare(
      "INSERT INTO view_custom (user_id, slot, css, html, js, label, icon, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, slot) DO UPDATE SET css = excluded.css, html = excluded.html, js = excluded.js, label = excluded.label, icon = excluded.icon, updated_at = excluded.updated_at"
    ).bind(user.id, slot, css, html, js, label, icon, at).run();
    return json({ custom: { slot, css, html, js, label, icon, updated_at: at } });
  });

  on("DELETE", "/custom/:slot", async ({ env, user, params }) => {
    await env.DB.prepare("DELETE FROM view_custom WHERE user_id = ? AND slot = ?").bind(user.id, decodeURIComponent(params.slot)).run();
    return json({ ok: true });
  });
}
