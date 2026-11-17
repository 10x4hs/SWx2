// Dock 의 두 집 — Plan(할 일) · Obsidian(노트) 화면마다 같은 탭 줄 (2026-11-17)
//   Plan: 시간표(#/calendar…) · 체크리스트(#/checklist/list) · 보드(#/checklist/board) · 목표(#/goals/…) + AI로 짜기(#/planner)
//   Obsidian: 지도(#/brain… 개념 층) · 노트(#/notes…) · 그래프(#/brain/graph)
//   폰에서는 줄이 넘치면 옆으로 넘겨요 (한 글자씩 줄바꿈 없이)
import { ymd, today } from "./util.js";

const PLAN = [
  ["cal", "시간표", () => "#/calendar/" + ymd(today())],
  ["list", "체크리스트", () => "#/checklist/list"],
  ["board", "보드", () => "#/checklist/board"],
  ["goals", "목표", () => "#/goals/week"],
];
const BRAIN = [
  ["map", "지도", () => "#/brain"],
  ["notes", "노트", () => "#/notes"],
  ["graph", "그래프", () => "#/brain/graph"],
];

const cur = (k, on) => (k === on ? ' aria-current="page"' : "");
const bar = (home, label, tabs, on, extra = "") =>
  `<div class="home-tabs" data-home="${home}"><nav class="seg glass home-tabs-nav" aria-label="${label}">${tabs.map(([k, l, h]) => `<a href="${h()}" data-tab="${k}"${cur(k, on)}>${l}</a>`).join("")}</nav>${extra}</div>`;

/** Plan 탭 줄 — on: cal | list | board | goals | ai */
export const planTabs = (on) => bar("plan", "Plan", PLAN, on, `<a class="btn sm ghost home-tabs-ai" href="#/planner" data-tab="ai"${cur("ai", on)}>AI로 짜기</a>`);
/** Obsidian 탭 줄 — on: map | notes | graph */
export const brainTabs = (on) => bar("brain", "Obsidian", BRAIN, on);

/** 같은 화면 안에서 탭만 바뀔 때 (체크리스트 ↔ 보드) */
export function markTab(root, on) {
  root.querySelectorAll(".home-tabs [data-tab]").forEach((a) => { if (a.dataset.tab === on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
