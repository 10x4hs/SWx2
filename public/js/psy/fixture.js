// Psychology 임시 데이터 — public/psy/*.json 이 아직 없을 때만 써요 (모양은 PSY_PLAN 데이터 계약과 같아요)
const C = (id, track, en, ko, line, example, why, use, counter, evidence = "STRONG", extra = {}) => ({ id, track, en, ko, line, example, why, use, counter, evidence, source: { cite: extra.cite || "Cialdini (2021)", url: "" }, related: extra.related || [], videos: extra.videos || [], ...extra });
export const FIXTURE = {
  cards: {
    tracks: [
      { id: "persuasion", no: "01", en: "PERSUASION", ko: "설득 심리", order: ["elm", "scarcity", "social-proof", "anchoring"] },
      { id: "argument", no: "02", en: "ARGUMENT", ko: "논증 · 반박", order: ["strawman", "steelman"] },
      { id: "business", no: "03", en: "BUSINESS", ko: "협상 · 비즈니스", order: ["batna", "labeling"] },
      { id: "classical", no: "04", en: "CLASSICAL", ko: "고전 수사학", order: ["ethos"] },
      { id: "figures", no: "05", en: "FIGURES", ko: "수사 기법", order: ["antithesis"] },
      { id: "defense", no: "06", en: "DEFENSE", ko: "방어 · 면역", order: ["inoculation"] },
      { id: "library", no: "07", en: "LIBRARY", ko: "서재", order: ["influence-6"] },
    ],
    cards: [
      C("elm", "persuasion", "ELABORATION LIKELIHOOD MODEL", "정교화 가능성 모델", "사람은 관심·여유가 있으면 논거의 질(중심 경로)로, 없으면 말하는 사람·분위기 같은 단서(주변 경로)로 설득된다.", "팀장 (바쁨): \"그래서 결론이 뭐야?\"\n나: \"한 줄이면, 비용 20% 줄어요. 근거는 메일에 3개 붙였습니다.\"", "생각할 동기와 능력이 경로를 정한다. 중심 경로로 바뀐 태도가 더 오래간다.", "상대가 바쁘면 결론+신뢰 단서, 관심이 크면 근거를 깊게.", "급하게 끌릴 때 \"근거만 놓고 보면?\"을 스스로 묻는다.", "STRONG", { cite: "Petty & Cacioppo (1986)", related: ["social-proof"], videos: ["v1"] }),
      C("scarcity", "persuasion", "SCARCITY", "희소성", "드물고 사라질 것 같으면 더 갖고 싶어진다.", "판매원: \"오늘까지만 이 가격이에요.\"", "잃을까 두려움(손실 회피)이 판단을 서두르게 한다.", "기한·수량을 사실대로 알린다.", "\"내일 와도 같은 조건이면 그때 정할게요.\"", "STRONG", { related: ["social-proof"], videos: ["v1"] }),
      C("social-proof", "persuasion", "SOCIAL PROOF", "사회적 증거", "확신이 없을 때 남들이 하는 걸 따라 한다.", "판매원: \"어제도 세 분이 이 자리에서 계약하셨어요.\"", "불확실할수록 다수의 행동을 정보로 쓴다.", "나와 비슷한 사람의 사례를 보여 준다.", "\"그분들 상황이 제 상황과 같나요?\"", "STRONG", { related: ["scarcity"] }),
      C("anchoring", "persuasion", "ANCHORING", "앵커링", "처음 들은 숫자가 기준점이 되어 뒤 판단을 끌어당긴다.", "팀장: \"3%가 최선입니다.\"", "조정이 늘 모자라서 첫 숫자 근처에 머문다.", "협상에서 근거 있는 첫 숫자를 먼저 낸다.", "시장 자료로 내 기준점을 따로 세운다.", "STRONG", { cite: "Tversky & Kahneman (1974)", related: ["batna"] }),
      C("strawman", "argument", "STRAW MAN", "허수아비 공격", "상대 주장을 약하게 바꿔 놓고 그걸 공격한다.", "A: \"야근을 줄이자.\"\nB: \"그럼 일 안 하겠다는 거야?\"", "바뀐 주장은 반박하기 쉽다.", "쓰지 말고, 알아보는 데 쓴다.", "\"제 말은 그게 아니라 ○○예요.\" 하고 원래 주장을 다시 세운다.", "MODERATE", { related: ["steelman"] }),
      C("steelman", "argument", "STEEL MAN", "강철 인간", "상대 주장을 가장 강한 형태로 고쳐 말한 뒤 답한다.", "나: \"네 말을 제일 좋게 정리하면 이거지? 그래도…\"", "상대가 들었다고 느끼면 방어가 내려간다.", "반박 전에 한 줄 요약부터.", "상대가 내 말을 비틀면 정확한 요약을 요구한다.", "MODERATE", { related: ["strawman"] }),
      C("batna", "business", "BATNA", "협상 결렬 시 최선책", "합의가 안 될 때 내가 할 수 있는 가장 좋은 대안.", "나: \"다른 곳 제안도 받아 둔 상태예요.\"", "대안이 좋을수록 버틸 힘이 생긴다.", "협상 전에 내 BATNA를 키운다.", "상대의 BATNA를 추정해 허세를 가린다.", "MODERATE", { cite: "Fisher & Ury (1981)", related: ["anchoring"] }),
      C("labeling", "business", "LABELING", "라벨링", "상대의 감정을 이름 붙여 말해 준다.", "나: \"예산이 빠듯하신 것 같네요.\"", "감정을 말로 하면 강도가 줄어든다.", "\"~인 것 같네요\"로 시작한다.", "내 감정이 라벨링되면 한 박자 쉬고 사실로 돌아온다.", "MODERATE", { cite: "Voss (2016)" }),
      C("ethos", "classical", "ETHOS", "에토스", "말하는 사람의 신뢰가 설득의 바탕이 된다.", "의사: \"20년 동안 이 수술을 해 왔어요.\"", "누가 말하느냐가 내용만큼 중요하다.", "경험·전문성을 먼저 짧게.", "\"그 분야 전문가가 맞나요?\"", "MODERATE", { cite: "Aristotle, Rhetoric" }),
      C("antithesis", "figures", "ANTITHESIS", "대조법", "반대되는 두 생각을 나란히 놓아 대비시킨다.", "\"나라가 무엇을 해 줄지 묻지 말고, 내가 나라를 위해 무엇을 할지 물어라.\"", "대비가 기억에 남는다.", "핵심 메시지를 A가 아니라 B로.", "멋진 대조에 빠지지 말고 내용을 따진다.", "EMERGING"),
      C("inoculation", "defense", "INOCULATION", "예방 접종", "약한 설득을 미리 맞아 보면 센 설득에 버틴다.", "\"곧 '오늘만 이 가격'이란 말을 들을 거야. 그건 압박이야.\"", "반박을 미리 연습하면 저항력이 생긴다.", "팀에 흔한 수법을 미리 알려 준다.", "—", "STRONG", { cite: "McGuire (1961)" }),
      C("influence-6", "library", "SIX PRINCIPLES", "설득의 6원칙", "상호성 · 일관성 · 사회적 증거 · 호감 · 권위 · 희소성.", "", "사람을 움직이는 지름길 여섯 가지.", "", "", "STRONG", { book: "influence", related: ["social-proof", "scarcity"] }),
    ],
  },
  books: { books: [{ id: "influence", en: "INFLUENCE", ko: "설득의 심리학", author: "Robert Cialdini", year: 1984, shelf: "persuasion", why: "설득 원칙을 처음 정리한 책.", cards: ["influence-6"] }, { id: "never-split", en: "NEVER SPLIT THE DIFFERENCE", ko: "우리는 어떻게 마음을 움직이는가", author: "Chris Voss", year: 2016, shelf: "business", why: "FBI 인질 협상가의 대화 기술.", cards: [] }] },
  videos: { videos: [{ id: "v1", title: "Science of Persuasion", channel: "influenceatwork", lang: "en", tracks: ["persuasion"], covers: ["scarcity", "social-proof", "elm"], kind: "lecture", why: "6원칙을 12분에 애니메이션으로 정리해요.", mins: 12 }] },
  spar: { scenarios: [
    { id: "salary", title: "연봉 협상", role: "깐깐한 팀장", goal: "5% 이상 인상", opener: "올해 예산이 빠듯해요. 3%가 최선입니다. 다들 그 정도 받았어요." },
    { id: "price", title: "가격 흥정", role: "중고차 판매원", goal: "100만 원 깎기", opener: "이 차는 오늘 보러 오는 분이 두 분 더 있어요." },
    { id: "phishing", title: "보이스피싱 전화", role: "검찰 사칭범", goal: "개인정보 지키기", opener: "서울중앙지검입니다. 본인 명의 통장이 범죄에 쓰였습니다." },
  ] },
};
