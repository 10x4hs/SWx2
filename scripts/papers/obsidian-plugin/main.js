// 논문 스프린트 정리 — 10.5(한국 시간)가 지나면 '논문 공부/' 를 휴지통으로, 홈의 논문 칸을 지우고, 스스로 꺼져요.
// 그 전에는 상태 표시줄에 "📄 논문 D-n" 만 보여요. 지운 것은 휴지통에서 되살릴 수 있어요.
const { Plugin, Notice } = require("obsidian");

const UNTIL = "2026-10-05";
const FOLDER = "논문 공부";
const HOME = "🏠 홈.md";
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const daysLeft = () => Math.round((Date.parse(UNTIL + "T00:00:00Z") - Date.parse(kstToday() + "T00:00:00Z")) / 864e5);

module.exports = class PapersSprint extends Plugin {
  async onload() {
    this.bar = this.addStatusBarItem();
    this.paint();
    this.app.workspace.onLayoutReady(() => this.check());
    this.registerInterval(window.setInterval(() => this.check(), 30 * 60 * 1000));
  }

  paint() {
    const d = daysLeft();
    this.bar.setText(d > 0 ? `📄 논문 D-${d}` : d === 0 ? "📄 논문 마지막 날" : "");
  }

  async check() {
    this.paint();
    if (kstToday() <= UNTIL || this.done) return;
    this.done = true;
    try {
      const folder = this.app.vault.getAbstractFileByPath(FOLDER);
      if (folder) await this.app.vault.trash(folder, true); // 시스템 휴지통 (되살리기 가능)
      const home = this.app.vault.getAbstractFileByPath(HOME);
      if (home) await this.app.vault.process(home, (s) => s.replace(/<!-- papers:start -->[\s\S]*?<!-- papers:end -->\n*/, ""));
      new Notice("논문 스프린트(10.1–10.5)가 끝나서 '논문 공부' 구역을 휴지통으로 옮겼어요.", 12000);
      await this.app.plugins.disablePluginAndSave(this.manifest.id);
    } catch (e) {
      this.done = false;
      console.error("[papers-sprint]", e);
      new Notice("논문 공부 구역을 정리하지 못했어요. 직접 지워 주세요: " + e.message, 12000);
    }
  }
};
