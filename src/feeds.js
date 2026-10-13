// =====================================================================================
// [파일 역할]: 뉴스 소스 목록 (지정학 · AI · 첨단기술)
// [초보자 설명]:
//   - 2026-10-12 에 아래 주소를 **전부 직접 호출해서** 확인했어요. HTTP 200 + 유효한 XML +
//     최근 글이 실제로 들어 있는지까지요.
//   - ⚠️ 피드는 조용히 죽어요. 200 에 멀쩡한 XML 을 계속 주면서 몇 년째 새 글이 없는 곳이
//     실제로 있었어요. 그래서 DEAD 목록을 따로 두고, 수집기는 마지막 글이 90일보다
//     오래되면 경고를 띄워요.
// =====================================================================================

// [이름, 주소, 주제, 언어, 처음부터 켤지, 왜 신호가 높은가]
export const SEED = [
  ["Import AI", "https://jack-clark.net/feed/", "ai", "en", true, "Anthropic 공동창업자. 논문을 읽고 산업·정책 의미를 붙인다"],
  ["ChinAI Newsletter", "https://chinai.substack.com/feed", "china", "en", true, "중국 AI 업계가 중국어로 하는 말을 통째로 번역"],
  ["Pekingnology", "https://www.pekingnology.com/feed", "china", "en", true, "중국 관료·학자 연설 전문 번역. 정책 전환의 선행 담론"],
  ["MERICS", "https://merics.org/en/rss", "china", "en", true, "베를린 중국연구소. 미국 싱크탱크와 결론이 갈린다"],
  ["War on the Rocks", "https://warontherocks.com/feed/", "geopolitics", "en", true, "현직·전직 군/정보 실무자 실명 기고"],
  ["Lowy Interpreter", "https://www.lowyinstitute.org/the-interpreter/rss.xml", "geopolitics", "en", true, "호주 = 미중 어느 쪽도 아닌 중간국 시각"],
  ["Chartbook (Adam Tooze)", "https://adamtooze.substack.com/feed", "macro", "en", true, "거시·에너지·지정학을 하나의 인과로 묶는다"],
  ["The Chip Letter", "https://thechipletter.substack.com/feed", "semi", "en", true, "반도체 역사·아키텍처. 지금 구도가 왜 이렇게 생겼는지"],
  ["ChinaTalk", "https://www.chinatalk.media/feed", "china", "en", false, "수출통제·산업정책을 실무자 인터뷰로"],
  ["Sinification", "https://sinification.substack.com/feed", "china", "en", false, "중국 매파·현실주의 학자 글 번역"],
  ["Ginger River Review", "https://www.gingerriver.com/feed", "china", "en", false, "전직 관영매체 기자가 당 이론지를 읽어준다"],
  ["Baiguan", "https://www.baiguan.news/feed", "china", "en", false, "중국 경제 데이터를 현지 지표로 검증"],
  ["Interconnected (Kevin Xu)", "https://interconnected.blog/rss/", "china", "en", false, "미중 기술 양쪽 경험. 중국어판 동시 발행"],
  ["China Media Project", "https://chinamediaproject.org/feed/", "china", "en", false, "당의 언어 자체를 추적. 정책 전환 선행지표"],
  ["China Law Translate", "https://www.chinalawtranslate.com/feed/", "china", "en", false, "중국 법령·규제 초안 원문 번역"],
  ["CSET (Georgetown)", "https://cset.georgetown.edu/feed/", "china", "en", false, "중국 AI·칩을 특허·조달공고 원데이터로 측정"],
  ["量子位 QbitAI", "https://www.qbitai.com/feed", "china", "zh", false, "중국어 RSS 중 사실상 유일하게 살아있는 고신호 소스"],
  ["CEPA", "https://cepa.org/feed/", "europe", "en", false, "중·동유럽·발트 시각. 러시아·NATO를 한 박자 빠르게"],
  ["Politico Europe", "https://www.politico.eu/feed/", "europe", "en", false, "EU 규제가 만들어지는 과정"],
  ["Der Spiegel International", "https://www.spiegel.de/international/index.rss", "europe", "en", false, "독일 산업·에너지·대중국 정책의 국내 논리"],
  ["Verfassungsblog", "https://verfassungsblog.de/feed/", "europe", "en", false, "AI Act·디지털 규제의 법리를 가장 먼저"],
  ["RUSI Commentary", "https://www.rusi.org/rss/latest-commentary.xml", "europe", "en", false, "우크라이나 교훈·군수생산 분석"],
  ["Transformer", "https://www.transformernews.ai/feed", "ai", "en", false, "AI 안전·정책 전담 뉴스룸"],
  ["Interconnects (Nathan Lambert)", "https://www.interconnects.ai/feed", "ai", "en", false, "오픈웨이트·RL 학습법 해부. 중국 오픈모델 분석 정확"],
  ["Epoch AI", "https://epoch.ai/atom.xml", "ai", "en", false, "학습 compute·비용을 실제 측정"],
  ["Hyperdimensional (Dean Ball)", "https://www.hyperdimensional.co/feed", "ai", "en", false, "미국 AI 규제 법안을 조문 수준으로"],
  ["AI Snake Oil", "https://www.aisnakeoil.com/feed", "ai", "en", false, "과장을 체계적으로 반증. 낙관 소스와 대조용"],
  ["Tech Policy Press", "https://techpolicy.press/rss/feed.xml", "geopolitics", "en", false, "기술 거버넌스. www 붙이면 작동 안 함"],
  ["High Capacity", "https://highcapacity.substack.com/feed", "semi", "en", false, "제조·산업역량. 미국 재산업화 논쟁의 실제 숫자"],
  ["Fabricated Knowledge", "https://www.fabricatedknowledge.com/feed", "semi", "en", false, "반도체 애널리스트 관점. 2026-08 이후 뜸함 — 지켜볼 것"],
  ["Construction Physics", "https://www.construction-physics.com/feed", "semi", "en", false, "왜 미국은 공장·원전을 빨리 못 짓나를 비용으로 분해"],
  ["Rest of World", "https://restofworld.org/feed/latest/", "semi", "en", false, "중국 기술의 글로벌사우스 침투를 현지 취재"],
  ["Heatmap News", "https://heatmap.news/feeds/feed.rss", "energy", "en", false, "에너지 전환의 정치경제. AI 데이터센터 전력수요와 연결"],
  ["Carbon Brief", "https://www.carbonbrief.org/feed/", "energy", "en", false, "중국 배출·재생에너지 데이터 분석"],
  ["Payload", "https://payloadspace.com/feed/", "energy", "en", false, "우주 산업을 비즈니스·자금 관점으로"],
  ["The Overshoot", "https://theovershoot.co/feed/", "macro", "en", false, "무역 불균형·자본흐름을 데이터로"],
  ["Phenomenal World", "https://www.phenomenalworld.org/feed/", "macro", "en", false, "산업정책·국제금융의 구조적 분석. 속보가 없어서 좋다"],
  ["PIIE Update", "https://www.piie.com/rss/update.xml", "macro", "en", false, "관세 실측 분석"],
  ["Semafor", "https://www.semafor.com/rss.xml", "macro", "en", false, "걸프·아프리카 커버리지가 미국 매체 중 가장 넓다"],
  ["Riddle Russia", "https://ridl.io/feed/", "geopolitics", "en", false, "러시아 내부 엘리트 역학을 러시아 분석가가"],
  ["Meduza (EN)", "https://meduza.io/rss/en/all", "geopolitics", "en", false, "망명 러시아 독립언론"],
  ["Amwaj.media", "https://amwaj.media/feed", "geopolitics", "en", false, "이란·이라크·걸프를 역내 소스로"],
  ["Global Taiwan Institute", "https://globaltaiwan.org/feed/", "geopolitics", "en", false, "대만 국내정치가 양안 정책에 어떻게 반영되는지"],
  ["The Diplomat", "https://thediplomat.com/feed/", "geopolitics", "en", false, "중앙아시아·남아시아 공백을 메움"],
  ["CFR", "https://feeds.feedburner.com/CouncilOnForeignRelations", "geopolitics", "en", false, "cfr.org 자체 피드는 404 — FeedBurner 경유만 동작"],
  ["Stimson Center", "https://www.stimson.org/feed/", "geopolitics", "en", false, "핵·군비통제·메콩"],
  // 2026-10-13 추가: 매일 나오는 AI 산업 뉴스 (모델 출시 · 회사 소식). migrations/0039 에도 같은 목록이 있어요.
  ["The Verge AI", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "ai", "en", true, "모델 출시 · 빅테크 AI 소식 일간"],
  ["TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/", "ai", "en", true, "AI 스타트업 · 투자 · 출시 일간"],
  ["MIT Technology Review AI", "https://www.technologyreview.com/topic/artificial-intelligence/feed", "ai", "en", true, "AI 연구 · 산업 해설"],
  ["The Decoder", "https://the-decoder.com/feed/", "ai", "en", true, "AI 모델 · 회사 소식을 매일 여러 편"],
  ["Simon Willison", "https://simonwillison.net/atom/everything/", "ai", "en", true, "LLM 신모델을 직접 써 보고 바로 쓰는 블로그"],
  ["Ars Technica AI", "https://arstechnica.com/ai/feed/", "ai", "en", true, "AI 산업 · 정책 일간"],
  ["OpenAI News", "https://openai.com/news/rss.xml", "ai", "en", true, "OpenAI 공식 발표"],
  ["Hugging Face Blog", "https://huggingface.co/blog/feed.xml", "ai", "en", true, "오픈 모델 · 도구 발표"],
  ["Google AI Blog", "https://blog.google/technology/ai/rss/", "ai", "en", true, "Google · DeepMind 공식 AI 발표"],
];

// 넣지 말 것 — 200 에 유효한 XML 을 주지만 실제로는 멈춘 피드.
// 코드에 넣으면 에러 없이 옛날 글만 들어와요.
export const DEAD = [
  ["MacroPolo", "https://macropolo.org/feed/", "2024-12-10", "조직 종료"],
  ["The China Project", "https://thechinaproject.com/feed/", "2023-12-31", "폐간"],
  ["ChinaFile", "https://www.chinafile.com/rss.xml", "2012", "아이템 1개"],
  ["CSIS", "https://www.csis.org/rss.xml", "2016-03-03", "깨진 Drupal 피드"],
  ["Asianometry", "https://asianometry.substack.com/feed", "2025-01-21", "629일째 멈춤. 유튜브로 옮긴 듯"],
  ["Ember", "https://ember-energy.org/feed/", "-", "817바이트 빈 피드. 아이템 0개"],
  ["Lawfare", "https://www.lawfaremedia.org/feeds/articles", "-", "329바이트 빈 피드. 아이템 0개"],
  ["VentureBeat AI", "https://venturebeat.com/category/ai/feed/", "-", "2026-10-13 HTTP 429 (봇 차단)"],
  ["Google DeepMind", "https://deepmind.google/blog/rss.xml", "-", "2026-10-13 아이템 0개 → Google AI Blog 로 대신"],
  ["Anthropic", "https://www.anthropic.com/rss.xml", "-", "공식 RSS 없음 (404)"],
];
