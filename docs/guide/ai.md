# AI 키 · 뜻으로 찾기(RAG)

## AI 키 (무료)

`.dev.vars` (git에 안 올라가요) 에 한 줄씩:

```bash
GEMINI_API_KEY=AQ....
GROQ_API_KEY=gsk_...
COHERE_API_KEY=...
MIMO_API_KEY=sk-...        # 선택
ZHIPU_API_KEY=...          # 선택
OPENROUTER_API_KEY=sk-or-... # 선택
KILO_API_KEY=...           # 선택
OLLAMA_API_KEY=...         # 선택
INVITE_CODE=...
PASSWORDLESS=1             # 로컬 전용
```

| 키 | 받는 곳 | 쓰는 곳 · 메모 |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com → Get API key | 채팅(Gemini Flash/Pro), 노트 정리 1순위. 무료, 카드 없음. 새 키는 `AQ.` 로 시작 |
| `GROQ_API_KEY` | https://console.groq.com/keys | 채팅(GPT-OSS 120B → 20B → Qwen), 정리 2순위. 아주 빠름. 무료는 분당 약 8천 토큰이라 긴 정리는 다음 순서로 넘겨요 |
| `COHERE_API_KEY` | https://dashboard.cohere.com/api-keys | 채팅(Command A), 정리 3순위, **비슷한 노트 찾기(임베딩 `embed-multilingual-v3.0`)**. 무료(Trial) 키는 한 달 호출 수가 제한돼요 |
| `MIMO_API_KEY` | 샤오미 MiMo 개발자 플랫폼 (`api.xiaomimimo.com`) | 채팅(MiMo, 따로 선택), 정리 4순위. 추론 과정 표시 |
| `ZHIPU_API_KEY` | https://open.bigmodel.cn → API Keys | 채팅(GLM 4.5 Flash, 따로 선택), 정리 5순위. 무료지만 느려요(수십 초). 4.6 은 무료 키가 429 |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys | 채팅(`openrouter/free` — 그때그때 되는 무료 모델로 자동), 정리 6순위. 실제로 답한 모델은 상태 줄에 보여요 |
| `KILO_API_KEY` | https://app.kilo.ai → API Keys | 채팅(`kilo-auto/free` 자동 → `stepfun/step-3.7-flash:free`), 정리 7순위. 유료 모델은 크레딧 오류라 무료만 |
| `OLLAMA_API_KEY` | https://ollama.com → Settings → Keys | 채팅(`nemotron-3-ultra` → `gpt-oss:120b`), 정리 마지막 순서. 큰 모델이라 조금 느려요 |

- 채팅의 **전체 비교** = Gemini · Groq · Cohere 세 답을 나란히. 키가 없는 모델은 건너뛰어요.
- 노트 정리/생성(JSON)은 Gemini → Groq → Cohere → MiMo → Zhipu → OpenRouter → Kilo → Ollama 순서로 되는 곳을 써요. 대화방 AI(`aiText`)는 Groq → Gemini → Cohere → MiMo → Zhipu → OpenRouter → Kilo → Ollama. 뒤의 넷은 JSON 모드가 없어서 코드 펜스를 벗기고 `{ }` 만 골라 읽어요.
- `COHERE_API_KEY` 가 없거나 임베딩이 실패하면 '비슷한 노트 후보' 없이 예전처럼 정리해요.

키는 브라우저로 나가지 않고 Worker 비밀값에만 있어요. 사람당 하루 200개 질문 제한(`src/ai.js` 의 `DAILY_LIMIT`).

## 뜻으로 찾기 · 근거 달린 CIM 튜터 (`src/rag.js`)

글자 찾기(D1 FTS5 trigram)와 뜻 찾기(Workers AI `@cf/baai/bge-m3` 1024차원 + Vectorize cosine)를 RRF(k=60)로 섞어요.
D1 `chunks` 표가 원본이고 Vectorize 는 다시 만들 수 있는 색인이라, 벡터가 늦게 보이거나(쓰기 후 30초~몇 분) 실패해도 글자 찾기는 바로 돼요.

- **무엇을 넣나**: CIM 카드 399장(모두 같이, namespace `cim`) · 내 노트(namespace `u:<내 id>`, 서버가 세션 사람으로 정해요). CIM 문제 1,995개는 벡터 없이 글자 찾기만(맞으면 그 카드로). 일기는 안 넣어요.
- **어디에 보이나**: ⌘K 팔레트의 '뜻으로 찾기' 칸(`GET /api/search/semantic?q=`, 노트는 누구나 · CIM 카드는 cim 기능이 있는 사람만) · CIM AI 튜터의 [1] 근거 링크와 '근거' 칩(`POST /api/apps/cim/ask`).
- **벡터 색인 둘**: 배포본 `VECTORS` = `swx2-chunks`, `wrangler dev` = `VECTORS_DEV` = `swx2-chunks-dev`(`remote: true`). `VECTORS` 는 remote 가 아니라 로컬에서는 아예 닿지 않아요(로컬 표시 `PASSWORDLESS=1` 로 고름 — `vecIndex`). 두 색인 모두 메타데이터 색인 `kind` · `user_id` 가 있어요.
- **채우기**: 노트는 저장 · 지우기 때 뒤에서(`waitUntil`) 바뀐 조각만 다시 임베딩. 다른 길(Brain · MCP)로 바뀐 노트와 CIM 은 매시 크론(`ragCron`)이 천천히 — 처음엔 CIM 2장씩, 노트 40개 · 임베딩 96조각씩. 빨리 채우려면 `BASE=… node scripts/rag-index.mjs`(관리자).
- **무료 한도**: 저장 5M 차원(계정 전체) ≈ 4,880개 → 노트 벡터는 `RAG_NOTE_VEC_MAX`(기본 3000) · 사람마다 `RAG_USER_VEC_MAX`(1500)까지, 넘는 조각은 `skip`(글자 찾기만). 크론 임베딩은 하루 `RAG_DAILY_NEURONS`(4000, 무료 10,000 중) 어림값 안에서.
- **평가**: `BASE=http://127.0.0.1:8797 node scripts/rag-eval.mjs` — CIM 문제 → 그 카드 150개로 recall@1/5/10 · MRR. 2026-10-23 결과로 고른 기본값: 섞기(hybrid, RRF 같은 무게) · 글자 찾기는 낱말을 trigram 조각으로(어미가 붙어도 맞게) · 문제 행 벌점 2.0 · reranker 끔(`bge-reranker-base` 가 한국어에서 오히려 떨어뜨렸어요) · 노트 이웃(1-hop 링크) 끔 · '근거 있음' 기준 코사인 0.47 (상관없는 질문 최고 0.455, CIM 질문 하위 10% 0.556). 바꾸려면 `RAG_RERANK=1` · `RAG_NEIGHBORS=1` · `RAG_MIN_COS=…`.
- **개인 자료**: 튜터 근거에 내 노트가 들어가면 무료 데이터로 학습하지 않는 Groq 로만 보내요. 거기가 안 되면 노트를 빼고 CIM 근거로만 다시 물어요.
- **주의 — `wrangler d1 export`**: D1 내보내기는 가상 표(FTS5)가 있으면 실패해요. 내보내기 전에 `DROP TABLE chunks_fts;` → 내보내기 → `migrations/0067_chunks.sql` 의 `CREATE VIRTUAL TABLE` · 트리거 셋을 다시 실행하고 `INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');` (내용은 `chunks` 에 다 있어요).

