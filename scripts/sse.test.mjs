// node --test scripts/sse.test.mjs — 튜터 답 스트림(SSE) 도우미 하나를 서버 없이 검사해요
import test from "node:test";
import assert from "node:assert/strict";
import { sseResponse, relay } from "../src/lib/sse.js";

// ec.waitUntil 흉내: 일을 모아 두고 끝날 때까지 기다릴 수 있게
const fakeCtx = () => { const jobs = []; return { jobs, waitUntil: (p) => jobs.push(p) }; };
async function events(res) {
  const out = [], rd = res.body.getReader(), dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf("\n\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); assert.ok(l.startsWith("data: "), l); out.push(JSON.parse(l.slice(6))); }
  }
  assert.equal(buf, "", "no half event left over");
  return out;
}

test("headers: event-stream, no cache, no proxy buffering", () => {
  const ec = fakeCtx(), res = sseResponse(ec, async () => {});
  assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-accel-buffering"), "no");
  assert.equal(ec.jobs.length, 1, "the producer runs under waitUntil");
});

test("events arrive in order as `data: {json}` blocks and the stream closes", async () => {
  const ec = fakeCtx();
  const res = sseResponse(ec, async (send) => {
    await send({ type: "sources", sources: [{ n: 1 }] });
    const d = relay(send);
    await d("안녕", {}); await d("하세요");
    await d("", { reset: true });
    await d("다시");
    await send({ type: "end", text: "다시", used: "mock" });
  });
  const got = await events(res); await Promise.all(ec.jobs);
  assert.deepEqual(got, [
    { type: "sources", sources: [{ n: 1 }] },
    { type: "delta", text: "안녕" }, { type: "delta", text: "하세요" },
    { type: "reset" }, { type: "delta", text: "다시" },
    { type: "end", text: "다시", used: "mock" },
  ]);
});

test("a thrown error becomes one `error` event, with a default message", async () => {
  const ec = fakeCtx();
  const a = sseResponse(ec, async (send) => { await send({ type: "delta", text: "a" }); throw new Error("한도 초과"); });
  assert.deepEqual(await events(a), [{ type: "delta", text: "a" }, { type: "error", message: "한도 초과" }]);
  const b = sseResponse(ec, async () => { throw new Error(""); });
  assert.deepEqual(await events(b), [{ type: "error", message: "AI 답을 받지 못했어요." }]);
  await Promise.all(ec.jobs);
});

test("client gone: later sends are dropped quietly and the job still finishes", async () => {
  const ec = fakeCtx(); let after = 0;
  const res = sseResponse(ec, async (send) => {
    await send({ type: "delta", text: "first" });
    for (let i = 0; i < 5; i++) { await send({ type: "delta", text: "x" + i }); after++; }
  });
  const rd = res.body.getReader();
  await rd.read(); await rd.cancel();
  await Promise.all(ec.jobs);
  assert.equal(after, 5, "send never throws after the reader left");
});
