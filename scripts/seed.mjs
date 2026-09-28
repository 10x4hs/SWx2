// 예시 데이터: 로컬 DB를 비운 뒤 `npm run seed` (wrangler dev 실행 중이어야 해요).
// gyk · chj · hsk 계정이 있어야 해요 (npm run user:add)
const BASE = process.env.BASE || "http://127.0.0.1:8787";
const INVITE = process.env.INVITE || "trio-2026";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(); return `W:${y}-W${pad(Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7))}`; };
const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const addDays = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);

async function as(user) {
  let cookie = "";
  const call = async (method, path, body) => {
    const r = await fetch(BASE + "/api" + path, { method, headers: { "content-type": "application/json", "x-trio": "1", cookie }, body: body && JSON.stringify(body) });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    const data = await r.json();
    if (!r.ok) throw new Error(`${method} ${path}: ${data.error}`);
    return data;
  };
  await call("POST", "/auth/login", { username: user.username }); // 계정은 add-user.mjs 로 미리 만들어 둬요
  return call;
}

const people = [
  { username: "gyk", display_name: "GYK", goal: "정보처리기사",
    year: [["정보처리기사 최종 합격", 0], ["알고리즘 문제 300개", 0], ["책 12권 읽기", 0], ["필기 합격", 1]],
    month: [["실기 기출 5회분", 0], ["자료구조 책 끝내기", 1], ["SQL 문제 50개", 1], ["모의고사 2회", 0]],
    week: [["실기 3회분 풀기", 0], ["정규화 정리 노트", 1], ["스터디 발표 준비", 0]],
    day: [["영단어 50개", "07:30", 45, 1], ["실기 기출 2021-1회", "09:00", 120, 1], ["점심 후 산책", "12:30", 30, 1], ["SQL 조인 문제 10개", "14:00", 90, 0], ["오답 노트 정리", "20:00", 60, 0], ["내일 계획 세우기", "22:30", 15, 0]],
  },
  { username: "chj", display_name: "CHJ", goal: "토익",
    year: [["토익 900점", 0], ["영어 원서 5권", 0]],
    month: [["RC 파트5 문제집 끝내기", 1], ["LC 받아쓰기 20회", 0], ["모의 토익 4회", 0]],
    week: [["모의 토익 1회", 1], ["단어장 Day 11–15", 0]],
    day: [["LC 파트3 30문제", "10:00", 90, 1], ["단어 Day 12", "13:00", 60, 1], ["RC 파트7 지문 5개", "16:00", 60, 0]],
  },
  { username: "hsk", display_name: "HSK", goal: "파이썬",
    year: [["파이썬으로 웹 서비스 하나 배포", 0], ["깃허브 잔디 200일", 0]],
    month: [["파이썬 강의 완강", 0], ["미니 프로젝트 기획서", 0]],
    week: [["강의 섹션 4–6", 0], ["FastAPI 튜토리얼", 0]],
    day: [["강의 2개 듣기", "19:00", 90, 0], ["복습 코드 커밋", "21:00", 30, 0]],
  },
];

for (const p of people) {
  const call = await as(p);
  const add = (scope, period, text, extra = {}) => call("POST", "/plans", { scope, period, text, ...extra });
  const mark = async (res, done) => { if (done) await call("PATCH", "/plans/" + res.plan.id, { done: true }); };
  for (const [t, d] of p.year) await mark(await add("year", `Y:${today.getFullYear()}`, t), d);
  for (const [t, d] of p.month) await mark(await add("month", `M:${today.getFullYear()}-${pad(today.getMonth() + 1)}`, t), d);
  for (const [t, d] of p.week) await mark(await add("week", isoWeek(today), t), d);
  for (const [t, s, m, d] of p.day) await mark(await add("day", "D:" + ymd(today), t, { start: s, mins: m }), d);
  // 지난 3주 기록 → 히트맵과 연속 달성일
  for (let i = 1; i <= 20; i++) {
    const day = "D:" + ymd(addDays(-i));
    const n = 2 + ((i * 7 + p.username.length) % 3);
    for (let k = 0; k < n; k++) {
      const r = await add("day", day, `${p.goal} 공부 ${k + 1}`, { start: `${pad(9 + k * 2)}:00`, mins: 60 });
      if ((i + k + p.username.length) % 4 !== 0 || i < 5) await call("PATCH", "/plans/" + r.plan.id, { done: true });
    }
  }
  if (p.username === "gyk") {
    await add("day", "D:" + ymd(addDays(-1)), "정규화 3NF 예제 다시 풀기", { start: "21:00", mins: 45 });
    const logs = [["07:30", "알람 듣고 바로 일어남. 단어 시작", "note"], ["08:15", "완료 · 영단어 50개", "done"], ["09:00", "집중 50분 · 실기 기출", "focus"], ["11:05", "완료 · 실기 기출 2021-1회 (78점)", "done"], ["12:58", "완료 · 점심 후 산책", "done"], ["14:20", "조인 문제에서 LEFT JOIN 헷갈림 → 노트에 정리", "note"]];
    for (const [at, text, kind] of logs) await call("POST", "/logs", { day: ymd(today), at, text, kind });
    const notes = [
      ["정보처리기사", "# 정보처리기사\n\n올해 목표. 필기는 합격했고 실기 준비 중.\n\n## 실기 범위\n- [[SQL]] — 조인, 서브쿼리, 그룹 함수\n- [[정규화]] — 1NF부터 BCNF까지\n- [[자료구조]] — 스택, 큐, 트리\n- 소프트웨어 설계, 보안\n\n## 계획\n- [x] 필기 합격\n- [ ] 기출 10회분\n- [ ] 모의고사 3회\n\n#자격증 #목표", true],
      ["SQL", "# SQL\n\n## 조인\n`LEFT JOIN` 은 왼쪽 테이블 행을 **모두** 남긴다. 오른쪽에 짝이 없으면 NULL.\n\n```sql\nSELECT s.name, c.title\nFROM student s\nLEFT JOIN course c ON c.id = s.course_id;\n```\n\n> 헷갈리면 벤 다이어그램 말고 **결과 행 수**로 생각하기\n\n관련: [[정규화]], [[정보처리기사]]\n\n#DB #자격증", true],
      ["정규화", "# 정규화\n\n| 단계 | 조건 |\n|---|---|\n| 1NF | 원자값 |\n| 2NF | 부분 함수 종속 제거 |\n| 3NF | 이행 함수 종속 제거 |\n| BCNF | 결정자가 모두 후보키 |\n\n이상(anomaly): 삽입·삭제·갱신 이상.\n\n[[SQL]] 문제에서 자주 같이 나옴. 예제는 [[정규화 예제 모음]] 에 따로 모으기.\n\n#DB", false],
      ["자료구조", "# 자료구조\n\n- 스택: LIFO, 괄호 검사\n- 큐: FIFO, BFS\n- 트리: 전위·중위·후위 순회\n\n[[알고리즘]] 문제 풀 때 기본.\n\n#CS", false],
      ["알고리즘", "# 알고리즘\n\n올해 300문제 목표. 지금 128문제.\n\n- 정렬: 버블, 선택, 삽입, 퀵\n- 탐색: 이진 탐색\n\n[[자료구조]] 먼저 복습.\n\n#CS #목표", false],
      [ymd(today), `# 오늘\n\n## 배운 것\n- LEFT JOIN 은 왼쪽을 다 남긴다 → [[SQL]]\n- 3NF 이행 종속 예제 → [[정규화]]\n\n## 회고\n- 잘한 점: 아침 루틴 지킴\n- 아쉬운 점: 점심 뒤 집중이 떨어짐\n\n#데일리`, false],
    ];
    for (const [title, body, shared] of notes) await call("POST", "/notes", { title, body, shared });
  }
  if (p.username === "chj") {
    for (const [at, text, kind] of [["10:00", "집중 90분 · LC 파트3", "focus"], ["11:32", "완료 · LC 파트3 30문제 (26/30)", "done"], ["14:05", "완료 · 단어 Day 12", "done"]]) await call("POST", "/logs", { day: ymd(today), at, text, kind });
    for (const [title, body, shared] of [
      ["토익 LC 팁", "# 토익 LC 팁\n\n- 파트3: 질문을 **먼저** 읽고 듣기\n- 패러프레이즈 표현 모으기\n\n같이 보는 [[정보처리기사]] 노트처럼 목표 노트를 하나 만들자.\n\n#영어 #토익", true],
      ["영단어", "# 영단어\n\n- mandatory = required\n- postpone = put off\n\n[[토익 LC 팁]]\n\n#영어", false],
    ]) await call("POST", "/notes", { title, body, shared });
  }
  if (p.username === "hsk") {
    await call("POST", "/notes", { title: "FastAPI", body: "# FastAPI\n\n- 경로 함수, 의존성 주입\n- Pydantic 모델\n\n다음: 배포는 Cloudflare? #파이썬 #웹", shared: true });
  }
  console.log("seeded", p.username);
}
