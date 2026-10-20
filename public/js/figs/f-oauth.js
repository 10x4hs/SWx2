// 그림: OAuth — 비밀번호 대신 출입증(토큰)을 건네는 약속, 그리고 그 위에 로그인을 얹은 OIDC (Dev Flow 07 로그인 · 권한 · 보안 — 카드 9 · 10)
//   네 줄(사용자 브라우저 · 두런 앱 서버 · 카카오 인증 서버 · 카카오 API)의 차례 그림. 단계마다 화살표가 한두 개씩 그려져요.
//   카드의 카카오 예시(kauth.kakao.com · client_id · redirect_uri · response_type=code · code_challenge)를 그대로 써요.
//   opts.mode = "oauth"(기본 · 카드 9) | "oidc"(카드 10 — scope=openid 를 붙이면 ID 토큰이 함께 와요)
import { svg, el, set, g, text, line, rect, path, arrowHead, ease, reduced, readout, C } from "./kit.js";

// 넓은 칸 / 좁은 칸(폰 · 튜터, f.narrow) — 좁으면 viewBox 를 줄여서 글씨가 커 보이게 해요
const GEO = {
  wide: { W: 560, H: 458, LX: [70, 210, 350, 490], hw: 120, fs: 15, head: 16 },
  narrow: { W: 420, H: 484, LX: [54, 158, 262, 366], hw: 98, fs: 14, head: 15 },
};
const HEAD = [["사용자", "브라우저"], ["두런", "앱 서버"], ["카카오", "인증 서버"], ["카카오", "API"]];
const ROW0 = 100, ROWH = 32;

// 화살표 목록 — step: 몇 번째 단계에 그려지나 · back: 서버끼리(뒤쪽 통로) · ret: 응답(점선)
const MSGS = {
  oauth: [
    { id: "click", from: 0, to: 1, label: "카카오로 로그인", n: "카카오 로그인", step: 0 },
    { id: "redir", from: 1, to: 0, label: "카카오로 보내요", step: 0, ret: 1 },
    { id: "auth", from: 0, to: 2, label: "/oauth/authorize?…", mono: 1, step: 0 },
    { id: "pw", from: 0, to: 2, label: "아이디 · 비밀번호 · 동의", step: 1, lock: 1 },
    { id: "code", from: 2, to: 0, label: "일회용 code 와 돌려보내요", color: "b", step: 2, ret: 1 },
    { id: "cb", from: 0, to: 1, label: "/callback?code=…", mono: 1, color: "b", step: 2 },
    { id: "swap", from: 1, to: 2, label: "code + 검증값 + 시크릿", color: "b", step: 3, back: 1 },
    { id: "tok", from: 2, to: 1, label: "액세스 토큰", color: "c", step: 3, back: 1, ret: 1 },
    { id: "api", from: 1, to: 3, label: "토큰을 붙여 요청", color: "c", step: 4, back: 1 },
    { id: "info", from: 3, to: 1, label: "닉네임 · 프로필 사진", step: 4, back: 1, ret: 1 },
  ],
  oidc: [
    { id: "click", from: 0, to: 1, label: "카카오로 로그인", n: "카카오 로그인", step: 0 },
    { id: "redir", from: 1, to: 0, label: "카카오로 보내요", step: 0, ret: 1 },
    { id: "auth", from: 0, to: 2, label: "/oauth/authorize?…", extra: "scope=openid", mono: 1, step: 0 },
    { id: "pw", from: 0, to: 2, label: "아이디 · 비밀번호 · 동의", step: 0, lock: 1 },
    { id: "code", from: 2, to: 0, label: "일회용 code 와 돌려보내요", color: "b", step: 0, ret: 1 },
    { id: "cb", from: 0, to: 1, label: "/callback?code=…", mono: 1, color: "b", step: 0 },
    { id: "swap", from: 1, to: 2, label: "code + 검증값 + 시크릿", color: "b", step: 1, back: 1 },
    { id: "tok", from: 2, to: 1, label: "액세스 토큰 +", extra: "ID 토큰", color: "c", step: 1, back: 1, ret: 1, keep: 3 },
    { id: "who", self: 1, at: 1, label: "ID 토큰 → 회원번호 → 계정 ‘서연’", step: 2, back: 1, h: 1.25, keep: 3 },
    { id: "api", from: 1, to: 3, label: "액세스 토큰을 붙여 요청", color: "c", step: 3, back: 1 },
    { id: "info", from: 3, to: 1, label: "닉네임 · 프로필 사진", step: 3, back: 1, ret: 1 },
  ],
};
const STEPS = {
  oauth: [
    "사용자가 ‘카카오로 로그인’을 누르면, 두런 앱이 사용자를 카카오 동의 화면으로 보내요. 주소에 client_id · redirect_uri · response_type=code · code_challenge 가 붙어요.",
    "사용자는 카카오 화면에서 로그인하고 동의해요. 비밀번호는 카카오에만 들어가요 — 두런은 비밀번호를 못 봐요.",
    "카카오는 일회용 code(주황)를 붙여 redirect_uri(doran.app/callback)로 돌려보내요. 브라우저가 그 code 를 두런에 전해요.",
    "두런 앱 서버는 뒤쪽 통로로 code + PKCE 검증값 + 클라이언트 시크릿을 보내 출입증(액세스 토큰, 초록)으로 바꿔요. 브라우저는 이 대화를 못 봐요.",
    "두런은 토큰을 붙여 카카오 API 를 불러요. 받는 건 사용자가 허락한 정보뿐이에요. 비밀번호는 한 번도 두런에 오지 않았어요.",
  ],
  oidc: [
    "OIDC 도 흐름은 OAuth 그대로예요. 다만 처음 주소에 scope=openid(보라)를 붙여 ‘누구인지도 알려 줘’ 하고 부탁해요.",
    "code 를 토큰으로 바꿀 때, 액세스 토큰과 함께 ID 토큰(보라)이 와요.",
    "ID 토큰에는 ‘이 사람이 누구인지’가 담겨 있어요. 두런은 이메일 말고 카카오 회원번호로 계정을 찾아 로그인시켜요.",
    "액세스 토큰은 그대로 권한용이에요. 로그인(누구인지)은 OIDC 의 ID 토큰, 권한(무엇을 해도 되나)은 OAuth 의 액세스 토큰이에요.",
  ],
};

// 글자 폭 어림
const tw = (s, size, mono) => { let w = 0; for (const ch of String(s)) w += /[㄰-㆏가-힯]/.test(ch) ? 1 : mono ? 0.6 : /[\s.,:·'|!()]/.test(ch) ? 0.32 : /[A-Z0-9mw#?…]/.test(ch) ? 0.64 : 0.56; return w * size; };

export default {
  aspect: GEO.wide.H / GEO.wide.W,
  aspectNarrow: GEO.narrow.H / GEO.narrow.W,
  steps: (o) => STEPS[o.mode === "oidc" ? "oidc" : "oauth"],
  mount(stage, f) {
    const mode = f.opts.mode === "oidc" ? "oidc" : "oauth", list = MSGS[mode], steps = STEPS[mode];
    const nar = !!f.narrow, G = nar ? GEO.narrow : GEO.wide, { W, H, LX } = G;
    const s = svg(stage, W, H, "사용자 브라우저, 두런 앱 서버, 카카오 인증 서버, 카카오 API 사이에 오가는 OAuth 차례 그림");
    const col = (k) => (k ? C[k] : C.ink);
    // 줄마다 높이(h)가 달라서 쌓아서 계산해요 (메모 상자는 조금 더 높아요)
    const rowY = (k) => ROW0 + list.slice(0, k).reduce((n, m, j) => n + ((m.h || 1) + (list[j + 1]?.h ? 0.25 : 0)) * ROWH, 0);
    const lastY = rowY(list.length - 1);
    const bandG = g(s), laneG = g(s), msgG = g(s), noteG = g(s);

    // 뒤쪽 통로 (서버끼리) — 띠 + 이름
    const backRows = list.map((m, k) => (m.back ? k : -1)).filter((k) => k >= 0);
    const by0 = rowY(backRows[0]) - 20, by1 = rowY(backRows[backRows.length - 1]) + 14;
    const band = g(bandG);
    const pad = (LX[1] - LX[0]) / 2 - 4;
    rect(band, LX[1] - pad, by0, LX[3] + pad - (LX[1] - pad), by1 - by0, { r: 8, fill: C.soft });
    const bandLines = nar ? ["서버끼리", "브라우저는", "못 봐요"] : ["서버끼리 ·", "브라우저는 못 봐요"];
    const bmid = (by0 + by1) / 2 - (bandLines.length * 18) / 2;
    text(band, LX[0], bmid, "뒤쪽 통로", { size: 15, anchor: "middle", weight: 700, fill: C.sub });
    bandLines.forEach((t, k) => text(band, LX[0], bmid + 20 + k * 18, t, { size: 14, anchor: "middle", fill: C.sub }));

    // 줄 머리 + 세로 점선
    LX.forEach((x, k) => {
      rect(laneG, x - G.hw / 2, 12, G.hw, 50, { r: 8, fill: C.bg, stroke: k === 0 ? C.ink : C.line, sw: 1.5 });
      text(laneG, x, 29, HEAD[k][0], { size: G.head, anchor: "middle", weight: 700 });
      text(laneG, x, 48, HEAD[k][1], { size: 14, anchor: "middle", fill: C.sub });
      if (k === 0) {
        // 브라우저 줄은 뒤쪽 통로 구간에서 끊겨요 (못 봐요)
        line(laneG, x, 62, x, by0 - 4, { color: C.line, width: 1.4, dash: "4 4" });
        line(laneG, x, by1 + 4, x, lastY + 18, { color: C.line, width: 1.4, dash: "4 4" });
      } else line(laneG, x, 62, x, lastY + 18, { color: C.line, width: 1.4, dash: "4 4" });
    });

    // 화살표 하나
    const items = list.map((m, k) => {
      const y = rowY(k), gg = g(msgG);
      gg.style.display = "none";
      if (m.self) {
        // 두런 앱 서버 안에서 하는 일 (줄 위의 메모 상자)
        const str = m.label, w = tw(str, G.fs) + 28, x = Math.min(LX[m.at] + w / 2 - 22, W - 6 - w / 2), inner = g(gg); // 안쪽 묶음: 나타나기 · 바깥: 지난 단계면 옅게
        rect(inner, x - w / 2, y - 14, w, 28, { r: 6, fill: C.dSoft, stroke: C.d, sw: 1.6 });
        text(inner, x, y, str, { size: G.fs, anchor: "middle", weight: 700, fill: C.d });
        return { m, g: gg, grow: (u) => { inner.style.opacity = String(u); } };
      }
      const x1 = LX[m.from] + (m.to > m.from ? 4 : -4), x2 = LX[m.to] + (m.to > m.from ? -6 : 6), color = col(m.color);
      const ln = el(gg, "line", { x1, y1: y, x2: x1, y2: y, stroke: color, "stroke-width": 2, "stroke-dasharray": m.ret ? "6 4" : null, "stroke-linecap": "round" });
      const head = arrowHead(s, color);
      const cx = (LX[m.from] + LX[m.to]) / 2;
      const lab = el(gg, "text", { x: cx, y: y - 10, "font-size": G.fs, "text-anchor": "middle", "font-weight": 600, class: "fg-t halo", "dominant-baseline": "middle", "font-family": m.mono ? "var(--fg-mono)" : null });
      set(lab, { fill: color });
      el(lab, "tspan", {}, (nar && m.n) || m.label);
      if (m.extra) { const t2 = el(lab, "tspan", { dx: 6, "font-weight": 700 }, m.extra); set(t2, { fill: C.d }); }
      // 비밀번호 자물쇠 + 메모 (카카오 줄 옆)
      if (m.lock) {
        const lx = LX[2] + 16, ly = y - 1;
        rect(gg, lx, ly - 2, 13, 10, { r: 2, fill: C.no });
        path(gg, `M${lx + 2.5},${ly - 2} v-3.5 a4,4 0 0 1 8,0 v3.5`, { stroke: C.no, width: 1.8 });
        text(gg, lx + 19, ly + 3, nar ? "카카오만 봐요" : "비밀번호는 카카오만 봐요", { size: G.fs, weight: 700, fill: C.no, cls: "fg-t halo" });
      }
      return {
        m, g: gg,
        grow(u) { set(ln, { x2: x1 + (x2 - x1) * u }); ln.setAttribute("marker-end", u >= 1 ? head : ""); lab.style.opacity = String(Math.min(1, u * 1.6)); },
      };
    });

    // 정리 띠 (OAuth 마지막 단계) — 두런이 받은 것 · 받지 않은 것
    const sumG = g(noteG), sy = rowY(list.length - 1) + 36;
    if (mode === "oauth") {
      const lines = nar ? ["두런이 받은 것: 출입증(액세스 토큰)", "비밀번호: 한 번도 안 받음"] : ["두런이 받은 것: 출입증(액세스 토큰) · 비밀번호: 한 번도 안 받음"];
      rect(sumG, 12, sy, W - 24, 16 + lines.length * 19, { r: 8, fill: C.bg, stroke: C.c, sw: 1.6 });
      lines.forEach((t, k) => text(sumG, W / 2, sy + 18 + k * 19, t, { size: G.fs, anchor: "middle", weight: 700, fill: C.c }));
    }
    sumG.style.display = "none";

    // 읽기 칸
    const ro = readout(f.controls());
    const mono = (s) => `<span style="font-family:var(--fg-mono);font-size:13.5px;word-break:break-all">${s}</span>`;
    const URL_AUTH = (oidc) => mono(`https://kauth.kakao.com/oauth/authorize<br>&nbsp;&nbsp;?<span class="a">client_id</span>=두런_앱_키<br>&nbsp;&nbsp;&amp;<span class="b">redirect_uri</span>=https://doran.app/callback<br>&nbsp;&nbsp;&amp;<span class="c">response_type</span>=code<br>&nbsp;&nbsp;&amp;code_challenge=… <span class="dim">← PKCE</span>${oidc ? `<br>&nbsp;&nbsp;&amp;<span class="d">scope=openid</span>` : ""}`);
    const READ = {
      oauth: [
        `<div>${URL_AUTH(false)}</div><div class="dim">“카카오야, 두런(client_id)이 부탁하는데, 이 사람이 동의하면 일회용 코드(response_type=code)를 이 주소(redirect_uri)로 보내 줘.”</div>`,
        `<div>비밀번호는 <b>카카오 화면</b>에만 들어가요. 두런 앱 서버로는 오지 않아요.</div><div class="dim">OAuth 2.0 = 제3자 앱이 HTTP 서비스에 ‘제한된 접근’을 얻게 하는 틀 (RFC 6749)</div>`,
        `<div>${mono(`https://doran.app/callback?<span class="b">code</span>=…`)}</div><div class="dim">code 를 중간에 가로채도, PKCE 검증값이 없으면 토큰으로 못 바꿔요(code_challenge 의 짝).</div>`,
        `<div><span class="b">code</span> + PKCE 검증값 + 클라이언트 시크릿 → <span class="c">액세스 토큰(출입증)</span></div><div class="dim">카카오 로그인 문서: REST API 키에는 클라이언트 시크릿이 기본으로 켜져 있어요.</div>`,
        `<div><span class="c">액세스 토큰</span>으로 허락된 정보만: 닉네임 · 프로필 사진 <span class="dim">(카카오 기본 동의 항목)</span></div><div class="dim">OAuth 는 인증이 아니라 권한 위임이에요 — oauth.net: “OAuth 2.0 은 인증 프로토콜이 아니다.”</div>`,
      ],
      oidc: [
        `<div>${URL_AUTH(true)}</div><div class="dim">OIDC = OAuth 2.0 위의 단순한 신원 층 (OIDC Core 1.0) · 카카오는 OIDC 를 켜면 ID 토큰을 줘요.</div>`,
        `<div>토큰 교환 응답: <span class="c">액세스 토큰</span> + <span class="d">ID 토큰</span></div><div class="dim">ID 토큰 = ‘이 사람이 누구인지’ 담은 토큰</div>`,
        `<div><span class="d">ID 토큰</span> → 카카오 회원번호(sub) → 두런 계정 <b>서연</b> → 로그인 끝</div><div class="dim">카카오는 바뀔 수 있는 이메일 · 전화번호를 회원 ID 로 쓰지 말라고 권해요. “이메일로 계정 합치면 되죠?”는 위험해요.</div>`,
        `<div>로그인 = <span class="d">OIDC · ID 토큰</span>(누구인지) · 권한 = <span class="c">OAuth · 액세스 토큰</span>(무엇을 해도 되나)</div><div class="dim">OIDC 는 2024년 10월 ISO/IEC 26131:2024 국제표준이 됐어요. 카카오 · 네이버 로그인도 OAuth 2.0 기반이에요.</div>`,
      ],
    };

    let done = -1, run = 0;
    const mv = (ms, fn, ok) => new Promise((res) => {
      if (!ok()) { res(false); return; }
      if (!ms || reduced()) { fn(1); res(true); return; }
      const t0 = performance.now();
      const tick = (now) => { if (!ok() || !stage.isConnected) { res(false); return; } const t = Math.min(1, (now - t0) / ms); fn(ease.inOut(t)); if (t < 1) requestAnimationFrame(tick); else res(true); };
      requestAnimationFrame(tick);
    });

    async function go(i, animate) {
      if (i === done && animate) return;
      const tk = ++run, ok = () => tk === run && f.step() === i;
      done = -1;
      ro.set(READ[mode][i]);
      // 앞 단계 화살표는 옅게, 이번 단계 것은 진하게, 뒤 단계 것은 숨겨요
      const now = [];
      items.forEach((it) => {
        const st = it.m.step;
        it.g.style.display = st <= i ? "" : "none";
        it.g.style.opacity = st < i && it.m.keep !== i ? "0.42" : "1"; // keep: 정리 단계에서도 진하게 (ID 토큰 ↔ 액세스 토큰 비교)
        if (st < i) it.grow(1);
        else if (st === i) { it.grow(animate ? 0 : 1); now.push(it); }
      });
      sumG.style.display = "none";
      const backOn = items.some((it) => it.m.back && it.m.step <= i);
      bandG.style.opacity = backOn ? "1" : "0";
      for (const it of now) {
        const d = it.m.self ? 500 : Math.abs(LX[it.m.to] - LX[it.m.from]) * 3.2 + 250;
        if (!(await mv(animate ? d : 0, (u) => it.grow(u), ok))) return;
        if (animate && !(await mv(160, () => {}, ok))) return;
      }
      if (mode === "oauth" && i === steps.length - 1) { sumG.style.display = ""; if (!(await mv(animate ? 400 : 0, (u) => (sumG.style.opacity = String(u)), ok))) return; }
      done = i;
    }
    return { go, destroy() { run++; } };
  },
};
