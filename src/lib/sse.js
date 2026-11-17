// 튜터 답 스트림(SSE) 하나 — 논문 · 책 · MBA/SW 과정(registerCourse) · CIM 이 같이 써요.
//   data: {type: "delta"|"reset"|"sources"|"end"|"error", …}\n\n  (이름 · 모양은 화면이 이미 읽는 그대로)
//   produce(send) 가 던지면 error 한 번, 끝나면 닫아요. 사용자가 떠나 쓰기가 실패하면 그 뒤 send 는 조용히 버려요.
const HEADERS = { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" };

export function sseResponse(ec, produce) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter(), enc = new TextEncoder();
  let open = true;
  const send = async (o) => { if (!open) return; try { await writer.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { open = false; } };
  ec.waitUntil((async () => {
    try { await produce(send); }
    catch (e) { await send({ type: "error", message: e?.message || "AI 답을 받지 못했어요." }); }
    open = false; try { await writer.close(); } catch {}
  })());
  return new Response(readable, { headers: HEADERS });
}

// aiText 의 글자 콜백 → delta, 다른 모델로 다시 시작하면 reset
export const relay = (send) => (t, meta) => (meta?.reset ? send({ type: "reset" }) : send({ type: "delta", text: t }));
