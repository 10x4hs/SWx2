#!/usr/bin/env python3
"""ENGLISH-OS 볼트 → STUDY-OS (최상위: 🏠 홈 · 논문 공부/ · 영어 공부/)

  python3 scripts/papers/vault-restructure.py --dry-run          # 무엇을 바꿀지만
  python3 scripts/papers/vault-restructure.py --note 현황.md     # 실제로 (현황 노트는 앱이 준 .md)

하는 일 (여러 번 돌려도 같은 결과):
  1. 옵시디언이 켜져 있으면 멈춰요 (켜진 채로 옮기면 링크가 꼬여요)
  2. ~/Documents/_backup/ENGLISH-OS-<시각>.tar.gz 로 통째 백업
  3. ~/Documents/ENGLISH-OS → ~/Documents/STUDY-OS, 안의 영어 자료는 전부 '영어 공부/' 로
  4. 경로가 들어간 링크([[05 표현/…]], ![[첨부/…]], ](01 매일 기록/…)), dataview FROM "…", .obsidian 설정의 폴더 경로를 새 위치로
  5. 🏠 홈.md · 논문 공부/(📊 논문 현황 · 📚 16편 목록) · 정리 플러그인(10.6 에 논문 공부/ 를 휴지통으로) 추가
  6. 옵시디언 볼트 목록(obsidian.json)의 경로를 새 이름으로
"""
import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path
from urllib.parse import quote

HOME = Path.home()
DOCS = Path(os.environ.get("STUDY_DOCS", HOME / "Documents"))  # 테스트할 때만 바꿔요
OLD = DOCS / "ENGLISH-OS"
NEW = DOCS / "STUDY-OS"
EN = "영어 공부"
PAPERS = "논문 공부"
KEEP = {".obsidian", ".git", ".gitignore", ".trash", ".DS_Store"}
OBS_JSON = Path(os.environ.get("STUDY_OBS_JSON", HOME / "Library" / "Application Support" / "obsidian" / "obsidian.json"))
HERE = Path(__file__).resolve().parent
APP = "https://swx2.dsm-mafia.workers.dev"

ap = argparse.ArgumentParser()
ap.add_argument("--dry-run", action="store_true")
ap.add_argument("--note", help="앱의 '옵시디언에 넣기'로 받은 📊 논문 현황.md")
a = ap.parse_args()
DRY = a.dry_run
log = lambda *m: print(("[dry] " if DRY else "") + " ".join(str(x) for x in m))


def die(m):
    print("✖ " + m)
    sys.exit(1)


if subprocess.run(["pgrep", "-x", "Obsidian"], capture_output=True).returncode == 0:
    die("옵시디언을 먼저 완전히 꺼 주세요 (⌘Q).")

root = NEW if NEW.exists() else OLD
if not root.exists():
    die(f"볼트를 못 찾았어요: {OLD}")
try:
    os.listdir(root)
except PermissionError:
    die("문서 폴더를 읽을 권한이 없어요. 시스템 설정 → 개인정보 보호 및 보안 → 파일 및 폴더 → (이 터미널 앱) → '문서 폴더'를 켜 주세요.")

# 1) 백업 + 이름 바꾸기
if root == OLD:
    bdir = DOCS / "_backup"
    bfile = bdir / f"ENGLISH-OS-{dt.datetime.now():%Y%m%d-%H%M%S}.tar.gz"
    log("백업 →", bfile)
    if not DRY:
        bdir.mkdir(exist_ok=True)
        with tarfile.open(bfile, "w:gz") as t:
            t.add(OLD, arcname="ENGLISH-OS")
    log("이름 바꾸기", OLD, "→", NEW)
    if not DRY:
        OLD.rename(NEW)
        root = NEW
vault = root

# 2) 영어 자료 → 영어 공부/
en_dir = vault / EN
tops = []
for p in sorted(vault.iterdir()):
    if p.name in KEEP or p.name in (EN, PAPERS, "🏠 홈.md"):
        continue
    tops.append(p.name)
    log("옮기기", p.name, "→", f"{EN}/{p.name}")
    if not DRY:
        en_dir.mkdir(exist_ok=True)
        shutil.move(str(p), str(en_dir / p.name))
# 이미 옮겼던 경우에도 링크 고치기는 해야 해요 → 영어 공부/ 안의 최상위 이름들
if en_dir.exists():
    tops = sorted(set(tops) | {x.name for x in en_dir.iterdir() if x.name not in KEEP})
folders = [t for t in tops if not t.endswith(".md")]
notes = [t[:-3] for t in tops if t.endswith(".md")]

# 3) 링크 고치기 — 옛 최상위 경로로 시작하는 것만, 이미 '영어 공부/' 가 붙은 건 그대로
names = sorted(folders + notes, key=len, reverse=True)
alt = "|".join(re.escape(n) for n in names)
alt_url = "|".join(sorted({re.escape(v) for n in names for v in (quote(n), n.replace(" ", "%20"))}, key=len, reverse=True))
pats = [
    (re.compile(r"(!?\[\[)(" + alt + r")(?=[/|\]#])"), lambda m: m.group(1) + f"{EN}/" + m.group(2)),
    (re.compile(r"(\]\()(?:\./)?(" + alt + r")(?=/|\.md|\))"), lambda m: m.group(1) + f"{EN}/" + m.group(2)),
    (re.compile(r"(\]\()(?:\./)?(" + alt_url + r")(?=/|\.md|\))"), lambda m: m.group(1) + (quote(EN) if "%E" in m.group(2) else EN.replace(" ", "%20")) + "/" + m.group(2)),
    (re.compile(r'((?:FROM|from)\s+")(' + alt + r')(?=["/])'), lambda m: m.group(1) + f"{EN}/" + m.group(2)),
    (re.compile(r"""(dv\.pages\(\s*['`]")(""" + alt + r')(?=["/])'), lambda m: m.group(1) + f"{EN}/" + m.group(2)),  # dataviewjs
]
changed = 0
scan = en_dir if en_dir.exists() else vault
for md in scan.rglob("*.md"):
    if any(part in KEEP for part in md.relative_to(vault).parts):
        continue
    s = md.read_text("utf-8")
    t = s
    for rx, fn in pats:
        t = rx.sub(fn, t)
    if t != s:
        changed += 1
        log("링크 고침", md.relative_to(vault))
        if not DRY:
            md.write_text(t, "utf-8")
log(f"링크를 고친 노트 {changed}개")


# 4) .obsidian 설정 속 폴더 경로
def fix(v):
    if isinstance(v, str):
        for n in names:
            if v == n or v.startswith(n + "/") or v == n + ".md":
                return f"{EN}/{v}"
        return v
    if isinstance(v, list):
        return [fix(x) for x in v]
    if isinstance(v, dict):
        return {k: fix(x) for k, x in v.items()}
    return v


for cfg in sorted((vault / ".obsidian").rglob("*.json")):
    if "plugins" in cfg.parts and cfg.name == "manifest.json":
        continue
    try:
        data = json.loads(cfg.read_text("utf-8"))
    except Exception:
        continue
    new = fix(data)
    if new != data:
        log("설정 고침", cfg.relative_to(vault))
        if not DRY:
            cfg.write_text(json.dumps(new, ensure_ascii=False, indent=2), "utf-8")

# 5) 🏠 홈 · 논문 공부/ · 정리 플러그인
index = json.loads((HERE.parent.parent / "public" / "papers" / "index.json").read_text("utf-8"))
home_md = f"""# 🏠 공부 홈

<!-- papers:start -->
## 📄 논문 공부 · 10.1 → 10.5

> [!todo] 16편 × 3단계 (읽기 · 퀴즈 · 3분 설명) · 셋이 같이
> **[[{PAPERS}/📊 논문 현황|📊 논문 현황 열기]]** · [[{PAPERS}/📚 16편 목록|📚 16편 목록]] · [앱에서 공부하기]({APP}/#/papers)
> 끝났다는 기준: {index['goal']}
> 10월 6일이 되면 이 칸과 `{PAPERS}/` 는 자동으로 휴지통으로 가요.

<!-- papers:end -->
## 🇺🇸 영어 공부 · 6개월 프리토킹

- **[[{EN}/📌 여기서 시작|📌 여기서 시작]]** · [[{EN}/📊 내 진도|📊 내 진도]]
- 오늘 기록 열기: `Cmd + Shift + D`
- 앱의 영어 탭: [{APP}/#/english]({APP}/#/english)
"""
by_id = {p["id"]: p for p in index["papers"]}
stage = {s["n"]: s for s in index["stages"]}
rows = []
for d in index["days"]:
    rows.append(f"\n### {d['label']} · {d['theme']}\n")
    for pid in d["papers"]:
        p = by_id[pid]
        rows.append(f"- [ ] **[{p['title']}]({APP}/#/papers/{pid})** · {stage[p['stage']]['label']} · {p['year']}")
list_md = f"""---
tags: [논문스프린트]
---
# 📚 16편 목록

> [!info] 체크는 **[[📊 논문 현황]]** 판에서 해요 (셋에게 보여요). 여기 체크박스는 나만 보는 메모용이에요.
> 제목을 누르면 앱의 공부 페이지(쉬운 설명 · 그림 · 영상 · 퀴즈 · 3분 설명 · AI 튜터)가 열려요.

**끝났다는 기준:** {index['goal']}
{chr(10).join(rows)}

## 파이프라인 한 줄
{" → ".join(f"{s['n']} {s['label']}" for s in index['stages'])}
"""
log("쓰기 🏠 홈.md,", f"{PAPERS}/📚 16편 목록.md")
if not DRY:
    (vault / "🏠 홈.md").write_text(home_md, "utf-8")
    (vault / PAPERS).mkdir(exist_ok=True)
    (vault / PAPERS / "📚 16편 목록.md").write_text(list_md, "utf-8")
if a.note:
    note = Path(a.note).expanduser()
    if not note.exists():
        die(f"현황 노트를 못 찾았어요: {note}")
    log("쓰기", f"{PAPERS}/📊 논문 현황.md ←", note)
    if not DRY:
        shutil.copyfile(note, vault / PAPERS / "📊 논문 현황.md")
elif not (vault / PAPERS / "📊 논문 현황.md").exists():
    log(f"※ 📊 논문 현황.md 는 아직 없어요. 앱 논문 화면의 '옵시디언에 넣기'로 받아서 {PAPERS}/ 에 넣어 주세요.")

plug = vault / ".obsidian" / "plugins" / "papers-sprint"
log("플러그인 설치", plug.relative_to(vault))
if not DRY:
    plug.mkdir(parents=True, exist_ok=True)
    for f in ("manifest.json", "main.js"):
        shutil.copyfile(HERE / "obsidian-plugin" / f, plug / f)
    cp = vault / ".obsidian" / "community-plugins.json"
    lst = json.loads(cp.read_text("utf-8")) if cp.exists() else []
    if "papers-sprint" not in lst:
        lst.append("papers-sprint")
        cp.write_text(json.dumps(lst, ensure_ascii=False, indent=2), "utf-8")

# 6) 볼트 목록 경로
if OBS_JSON.exists():
    j = json.loads(OBS_JSON.read_text("utf-8"))
    for v in j.get("vaults", {}).values():
        if v.get("path") == str(OLD):
            log("obsidian.json 경로", OLD, "→", NEW)
            v["path"] = str(NEW)
    if not DRY:
        OBS_JSON.write_text(json.dumps(j, ensure_ascii=False), "utf-8")

print("\n끝! 옵시디언을 열면 STUDY-OS 볼트예요. 🏠 홈.md 부터 보세요." if not DRY else "\n(dry-run: 아무것도 바꾸지 않았어요)")
