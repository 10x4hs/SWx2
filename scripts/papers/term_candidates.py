#!/usr/bin/env python3
"""용어 후보 뽑기: python3 scripts/papers/term_candidates.py <id>
본문(요약 + 자세히 읽기)에서 영문 약어 · 괄호 속 원어 · **굵은 말** 을 세어 많이 나온 순으로 보여 줘요."""
import json, re, sys
from collections import Counter
from pathlib import Path

pid = sys.argv[1]
root = Path(__file__).resolve().parents[2] / "public" / "papers" / "content"

def texts(o):
    if isinstance(o, str): yield o
    elif isinstance(o, list):
        for x in o: yield from texts(x)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k not in ("id", "src", "youtube", "links", "related"): yield from texts(v)

blob = []
for name in (f"{pid}.json", f"{pid}.deep.json"):
    p = root / name
    if p.exists(): blob += list(texts(json.loads(p.read_text("utf-8"))))
t = "\n".join(blob)
acr = Counter(m for m in re.findall(r"(?<![A-Za-z])[A-Z][A-Za-z0-9\-]*[A-Z0-9][A-Za-z0-9\-]*(?![A-Za-z])", t) if len(m) >= 2)
paren = Counter(m.strip() for m in re.findall(r"\(([A-Za-z][A-Za-z0-9 \-/]{2,40})\)", t))
bold = Counter(m.strip() for m in re.findall(r"\*\*([^*\n]{2,30})\*\*", t))
print(f"# {pid}: 글자 {len(t):,}")
print("\n[영문 약어·이름] " + " · ".join(f"{k}({v})" for k, v in acr.most_common(70)))
print("\n[괄호 속 원어] " + " · ".join(f"{k}({v})" for k, v in paren.most_common(50)))
print("\n[굵은 말] " + " · ".join(f"{k}({v})" for k, v in bold.most_common(60)))
s = root / f"{pid}.json"
if s.exists():
    print("\n[기존 glossary] " + " · ".join(g["term"] for g in json.loads(s.read_text("utf-8")).get("glossary", [])))
