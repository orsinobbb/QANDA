# 大數第一堂課：學員輪廓問卷

## 課堂目的

以約 3 分鐘、8 道選擇題認識全班，讓學員看到「回答 → 資料 → 統計 → 提問 → 教學調整」。不考能力、不計分；縣市與年齡可略過。暱稱仍會保存在老師的雲端結果表，不是完全匿名調查。

題目：上課目的（複選）、所在縣市、年齡級距、學習節奏、AI 使用經驗、資料分析自信、學習形式（複選）、每週練習時間。

## 入口

- 學員：https://orsinobbb.github.io/QANDA/?survey=first-class-profile
- 班級報表：https://orsinobbb.github.io/QANDA/report.html?survey=first-class-profile
- 教學示範：https://orsinobbb.github.io/QANDA/report.html?survey=first-class-profile&source=demo
- 老師：https://orsinobbb.github.io/QANDA/?admin=1
- 老師報表：https://orsinobbb.github.io/QANDA/report.html?survey=first-class-profile&admin=1

示範為 36 份合成資料，完全不寫入雲端。「此裝置」不是全班資料。只有「班級正式資料」可用於教學決策。

## 正式開課前必做

1. 執行 `npm run build:pages`，將 `dist/apps-script/Code.gs` 的完整內容更新到現有 Apps Script 專案。不要只貼原始 `apps-script/Code.gs`，它依賴共用統計核心。
2. Apps Script「部署 → 管理部署 → 編輯 → 新版本 → 部署」，沿用原 Web App 與執行身分／存取設定。不必重建 Sheet，不必重設管理權杖，現有網址可沿用。
3. 在老師入口使用原管理權杖登入，選擇「大數第一堂課｜認識我們的學習樣貌」，檢查題目後使用「發布到雲端」。題目 JSON 也可由 `data/questionnaires/first-class-profile.json` 匯入。正式發布需要保留 `mode` 與 `analytics` 設定。
4. 開啟班級報表，確認可讀取正式資料，即使目前 0 份。以一份明確標記的測試回覆驗證 Sheet Results／Answers 和報表；清除測試資料後才發給學員。

尚未更新接口或發布成功時，學員按開始會被攔住，不會假裝已能正式收件。GitHub Pages 更新前端不等於 Apps Script 後端已更新。

## 課堂演示（約 10 分鐘）

1. 填答 3 分鐘，投影正式班級分布：大家為什麼來？偏好哪種節奏？
2. 比較「AI 經驗 × 上課目的」、「年齡 × 節奏」、「資料自信 × 節奏」。看人數、有效配對與列內比例，先提出問題，不急著推論原因。
3. 點「AI 與教學討論 → 複製 AI 提示」，貼到老師使用的 AI 工具。此版本沒有自動呼叫 AI。
4. 對照 AI 引用的數字，請學員找一項可靠觀察、一項過度推論，最後決定一項教學調整。

統計由程式計算；AI 負責解讀、提出假設與教學建議；老師和學員負責核對與決策。AI 提示只含彙整，不傳姓名或個別答案。

## 統計與生命週期

- 單選比例以該題有效回答為分母；多選同樣以有效填答人數為分母，因此合計可超過 100%。未填答另列，不當零分。
- 交叉表只納入兩題都有有效回答的提交，顯示列內比例。提交依 session 去重，不保證不同 session 是不同學生。
- 公開報表至少 5 份才顯示分布；這只是基本門檻，不等於完整去識別化。小班仍可能從少數組合猜到個人，勿轉傳到班外，也不可用年齡推定能力。
- CSV 匯出只有彙整，Excel 可開啟；老師的原始資料仍在 Google Sheet Results／Answers。
- 作答開始保存問卷版本；目前報表僅看最新發布版，不把不同版本混算。正式收集期間避免改題，下一期請複製新 ID，以保留上一班報表。
- 收件結束使用「關閉雲端問卷」。公開正式報表隨之停止供應，登入老師報表仍可查看。保留與刪除期限由老師訂定。
