# 問答自我判斷

一個以 JSON 設定問卷的問答系統原型，支援是非題、單選題、多選題、簡答題與複合式問題，並包含限時作答、特定人員序號啟動、前端/後端階段性記憶、結果搜尋匯出，以及 AI 出卷/改卷介面。

## 啟動

```powershell
npm start
```

預設服務位置：

```text
http://localhost:4173
```

範例登入：

```text
人員代號：A001
序號：STAR-2026
```

## AI 協作後端程式設計評量

三份考卷依能力深度分層，每份 100 分，結果會同時呈現總分、程度判定與各能力面向：

1. [第一份：基礎診斷](https://orsinobbb.github.io/QANDA/?survey=ai-backend-foundation)
2. [第二份：實作能力](https://orsinobbb.github.io/QANDA/?survey=ai-backend-implementation)
3. [第三份：整合與上線決策](https://orsinobbb.github.io/QANDA/?survey=ai-backend-production)

命題藍圖與各卷使用時機請見 [`docs/ai-backend-assessment-blueprint.md`](docs/ai-backend-assessment-blueprint.md)。

## 功能範圍

- `data/questionnaires/*.json`：一份 JSON 就是一張問卷。
- `POST /api/sessions/start`：用問卷、人員代號、序號啟動作答與倒數。
- `PUT /api/sessions/:id/answers`：前端自動暫存並同步到後端階段記憶。
- `POST /api/sessions/:id/submit`：送出後自動改固定答案，AI 題型可接 provider。
- `GET /api/results`：搜尋與分類後端作答結果。
- `GET /api/results/export.csv`：匯出 CSV。
- `POST /api/ai/questionnaires`：AI 出卷，沒有金鑰時會產生可測的本機草稿。
- 問卷生命週期：`draft → review → published → closed → archived`，管理端可執行合法轉換、查看版本與稽核紀錄。
- `PATCH /api/questionnaires/:id/lifecycle`：變更問卷狀態；只有 `published` 問卷能啟動新作答。

## AI 設定

不設定金鑰也能使用本機草稿與本機改卷 fallback。若要接 OpenAI-compatible Chat Completions provider，可設定：

```powershell
$env:AI_API_KEY="..."
$env:AI_MODEL="gpt-4.1-mini"
```

也可用 `AI_API_URL` 指向相容 API。

## 測試

```powershell
npm test
npm run utf8
```

## GitHub Pages 靜態部署

此專案的完整功能包含 Node API。GitHub Pages 只能跑靜態檔，因此 Pages 版本會用瀏覽器 `localStorage` 模擬 session、暫存、結果搜尋與 CSV 匯出；資料只存在作答者自己的瀏覽器。若需要多人共用後端資料，請部署 Node 服務到支援後端的平台。

建立 GitHub Pages 產物：

```powershell
npm run build:pages
```

產物會輸出到 `dist/`。repo 內已包含 `.github/workflows/pages.yml`，推到 GitHub 後可在 repository 的 Pages 設定中選擇 GitHub Actions 部署。

## Google Sheet 集中收件

`apps-script/Code.gs` 可將 GitHub Pages 上正式送出的結果集中寫入一份私有 Google Sheet：

1. 建立 Google Sheet，開啟「擴充功能 → Apps Script」。
2. 將 `apps-script/Code.gs` 與 `apps-script/appsscript.json` 貼入專案。
3. 在 Apps Script 編輯器執行一次 `setup()` 並授權。
4. 執行一次 `createAdminToken()`，立即保存執行紀錄中的權杖；程式只保存其雜湊，之後無法找回原文。
5. 選擇「部署 → 新增部署作業 → 網頁應用程式」，執行身分選「我」，存取權選「所有人」。
6. 將部署後的 `/exec` 網址填入 `public/integrations.js` 的 `googleAppsScriptUrl`。
7. 執行 `npm run build:pages`，提交並推送 GitHub Pages。

系統會建立 `Results`、`Competencies`、`Answers`、`AuditLog`、`Participants`、`QuestionBank`、`QuestionnaireItems` 與 `QuestionnaireReleases` 工作表。`QuestionBank` 保存題目內容、答案與評分方式；`QuestionnaireItems` 保存問卷組成；`QuestionnaireReleases` 保存每次正式發布的不可變版本。學員頁會優先讀取中央已發布版本，結果也會記錄實際作答版本。

管理入口為網站網址加上 `?admin=1`。驗證管理權杖前不載入管理工作區；一般網址與 `?survey=問卷ID` 學員連結只顯示作答介面。登入後可以查詢集中結果、匯出 CSV，並查看班級平均、及格率、三卷完成度、能力分布、弱題與學員進度；權杖只保存在目前分頁的 `sessionStorage`，不會寫入 GitHub。

題目生命週期：選擇問卷後可編輯 JSON；「暫存於本機」只供管理者預覽，「發布給學員」才會寫入中央版本並立即供新開啟頁面的學員作答，「停止中央發布」會關閉該問卷。內容未變時重複發布沿用原版本，內容改變才產生新版本，既有成績仍對應原題卷。

更新既有 Apps Script 時，貼上新版 `Code.gs`、再次執行 `setup()`，再到「部署 → 管理部署作業 → 編輯 → 新版本」即可保留原本的 `/exec` 網址。既有管理權杖會保留，不必重新產生；只有遺失或需要撤銷舊權杖時才執行 `createAdminToken()`。

接收端包含問卷白名單、管理 API 權杖、欄位驗證、`sessionId` 防重、寫入鎖定與公式注入防護。若要只接受名單內的人員，先填寫 `Participants`，再把 `Code.gs` 的 `requireParticipantList` 改成 `true`。

這是班級試行方案，不是強身份驗證。公開 Apps Script 端點仍可能被偽造呼叫；正式考試應改用登入、伺服器端計時與不可公開的答案資料庫。

## Lovable

Lovable 通常透過 GitHub 連接專案。建議先把本 repo 推到 GitHub，再到 Lovable 連接 GitHub repository。若要保留 Node API，請確認 Lovable 專案部署方案能支援後端，或把資料層改接 Supabase 等雲端後端。
