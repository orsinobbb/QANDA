const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const id = params.get("survey") || "first-class-profile";
const teacher = params.get("admin") === "1";
const endpoint = window.QANDA_CONFIG?.googleAppsScriptUrl;
if (params.get("source") === "demo") $("source").value = "demo";
let survey;
let data;
let generation = 0;
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
$("answerLink").href = `./?survey=${encodeURIComponent(id)}`;
$("refresh").addEventListener("click", load);
$("source").addEventListener("change", load);
$("crossSelect").addEventListener("change", renderCross);
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-view]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
  ["distribution", "cross", "ai"].forEach(view => $(view).hidden = view !== button.dataset.view);
}));
$("copyAi").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("aiPrompt").value); $("status").textContent = "已複製不含個資的彙整與 AI 分析提示。"; }
  catch { $("aiPrompt").select(); $("status").textContent = "瀏覽器未允許複製，請在 AI 分頁選取提示。"; }
});
$("export").addEventListener("click", () => {
  const rows = [["資料來源",$("source").selectedOptions[0].text,"問卷",id,"版本",data.version], ["題目","選項","人數","有效回答人數","比例%","未填答"]];
  data.distributions.forEach(q => q.options.forEach(option => rows.push([q.title,option.label,option.count,q.answered,option.percentage ?? "",q.missing])));
  data.crossTabs.forEach(table => {
    rows.push([], [table.title,"有效配對",table.paired,"未配對",table.missing], ["列","欄","人數","列內人數","列內比例%"]);
    table.rows.forEach(row => row.cells.forEach((cell,i) => rows.push([row.label,table.columns[i].label,cell.count,row.total,cell.percentage ?? ""])));
  });
  const csv = rows.map(row => row.map(cell => {
    const value = String(cell ?? "");
    const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g,'""')}"`;
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
  const link = document.createElement("a"); link.href = url; link.download = `${id}-${$("source").value}-aggregate.csv`; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});

async function getJson(url, options) {
  const response = await fetch(url, {...options,signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function cloud(action) {
  if (!endpoint) throw new Error("未設定雲端服務");
  const url = new URL(endpoint); url.searchParams.set("action",action); url.searchParams.set("id",id); url.searchParams.set("t",Date.now());
  const response = await getJson(url.toString());
  if (!response.ok || !response.data) throw new Error(response.error || "雲端尚未提供統計接口");
  return response.data;
}
async function definition() {
  if (survey && $("source").value !== "cloud") return survey;
  if ($("source").value !== "cloud") {
    try { return await getJson(`./data/questionnaires/${encodeURIComponent(id)}.json`); }
    catch { return (await getJson(`/api/questionnaires/${encodeURIComponent(id)}`)).questionnaire; }
  }
  try {
    const remote = await cloud("public.questionnaire");
    if (remote.questionnaire) return remote.questionnaire;
  } catch { /* A built-in survey is still available while its cloud release is pending. */ }
  try { return await getJson(`./data/questionnaires/${encodeURIComponent(id)}.json`); }
  catch { return (await getJson(`/api/questionnaires/${encodeURIComponent(id)}`)).questionnaire; }
}
function demoRows() {
  return Array.from({length:36},(_,i) => ({sessionId:`demo-${i}`,status:"submitted",answers:Object.fromEntries(survey.questions.map((q,index) => {
    if ((q.id === "city" || q.id === "age") && i % 13 === 0) return [q.id,null];
    const optionIndex = (i * (index % 3 + 1) + Math.floor(i / 5) + index) % q.options.length;
    return [q.id,q.type === "multiple" ? [...new Set([q.options[optionIndex].value,q.options[(optionIndex+2)%q.options.length].value])] : q.options[optionIndex].value];
  }))}));
}
function clearReport(message) {
  data = null;
  $("total").textContent = "—"; $("version").textContent = "—"; $("updated").textContent = "—";
  $("charts").innerHTML = `<p class="empty">${escape(message)}</p>`;
  $("crossTable").replaceChildren(); $("crossSelect").replaceChildren(); $("crossMeta").textContent = message;
  $("observations").replaceChildren(); $("aiPrompt").value = "";
  $("export").disabled = true; $("copyAi").disabled = true;
}
async function load() {
  const request = ++generation;
  const source = $("source").value;
  clearReport("正在讀取資料…"); $("status").textContent = "正在讀取資料…";
  try {
    survey = await definition();
    if (survey.mode !== "survey") throw new Error("此問卷為測驗，請使用老師的成績報表。");
    let next;
    if (source === "cloud") {
      const token = teacher && sessionStorage.getItem("qanda:sheet-admin-token");
      if (token) {
        const response = await getJson(endpoint,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({event:"admin.survey.analytics",questionnaireId:id,adminToken:token})});
        if (!response.ok || !response.data) throw new Error(response.error || "雲端尚未提供統計接口");
        next = response.data;
      } else next = await cloud("public.analytics");
      if (!Array.isArray(next.distributions) || !Array.isArray(next.crossTabs)) throw new Error("雲端統計接口版本尚未更新");
    } else {
      const sessions = source === "demo" ? demoRows() : Object.values(JSON.parse(localStorage.getItem("static:sessions") || "{}"))
        .filter(row => row.questionnaireId === id && Number(row.questionnaireVersion || row.questionnaire?.lifecycle?.version || 1) === Number(survey.lifecycle?.version || 1))
        .map(row => ({sessionId:row.id,status:row.status,answers:row.answers || {}}));
      next = QandaAnalytics.aggregate(survey,sessions);
    }
    if (request !== generation) return;
    data = next; render();
    $("status").textContent = source === "demo" ? "教學示範：36 份模擬資料，非真實學員回答，不會寫入雲端。" : source === "local" ? "僅此瀏覽器的已送出資料，不代表全班。" : "班級正式資料 · 僅彙整統計 · 不含姓名與個別答案";
  } catch(error) {
    if (request !== generation) return;
    clearReport("正式統計尚無法讀取。可切換「教學示範」查看報表。");
    $("status").textContent = `未載入正式資料：${error.message}。請老師確認已發布問卷，且 Apps Script 已更新部署。`;
  }
}
function render() {
  $("total").textContent = data.total; $("version").textContent = `v${data.version}`;
  $("updated").textContent = new Date(data.updatedAt).toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"});
  const withheld = data.withheld;
  $("export").disabled = withheld || !data.total; $("copyAi").disabled = withheld || !data.total;
  if (withheld) {
    $("charts").innerHTML = `<p class="empty">已收到 ${data.total} 份。至少 ${data.minimum} 份後才公開班級分布，降低小樣本辨識風險。</p>`;
    $("crossMeta").textContent = "提交份數尚未達公開門檻。"; return;
  }
  $("charts").innerHTML = data.distributions.map(q => `<article class="chart"><h2>${escape(q.title)}</h2><div class="chart-meta">有效回答 ${q.answered} · 未填答 ${q.missing}${q.multiple ? " · 可複選（合計可超過 100%）" : ""}</div>${q.options.map(option => `<div class="bar-row"><span class="bar-label">${escape(option.label)}</span><div class="track"><div class="fill" style="width:${Math.max(0,Math.min(100,Number(option.percentage || 0)))}%"></div></div><span class="bar-value">${option.count} · ${option.percentage ?? "—"}%</span></div>`).join("")}</article>`).join("");
  $("crossSelect").innerHTML = data.crossTabs.map((table,i)=>`<option value="${i}">${escape(table.title)}</option>`).join("");
  renderCross();
  $("aiPrompt").value = data.total ? QandaAnalytics.aiPrompt({...data,source:$("source").selectedOptions[0].text}) : "";
  $("observations").innerHTML = data.total ? `<h3>程式計算的觀察（非 AI 回覆）</h3>${["pace","purpose","ai_experience"].map(id => {
    const q = data.distributions.find(item=>item.id === id); if (!q?.answered) return "";
    const top = [...q.options].sort((a,b)=>b.count-a.count)[0];
    return `<p><strong>${escape(q.title)}</strong>：最多人選擇「${escape(top.label)}」，${top.count}／${q.answered} 人（${top.percentage}%）。可以再問：這項偏好如何影響練習安排？</p>`;
  }).join("")}` : "<p>尚無有效回答，不能推論學員輪廓。</p>";
}
function renderCross() {
  const table = data?.crossTabs[Number($("crossSelect").value || 0)];
  if (!table) return;
  $("crossMeta").textContent = `有效配對 ${table.paired} 份 · 未配對 ${table.missing} 份${table.multiple ? " · 多選合計可超過 100%" : ""}`;
  $("crossTable").innerHTML = `<table><caption class="note">${escape(table.title)}</caption><thead><tr><th scope="col">${escape(survey.questions.find(q=>q.id === table.row)?.title || "分組")}</th><th scope="col">列內人數</th>${table.columns.map(col=>`<th scope="col">${escape(col.label)}</th>`).join("")}</tr></thead><tbody>${table.rows.map(row=>`<tr><th scope="row">${escape(row.label)}</th><td>${row.total}</td>${row.cells.map(cell=>`<td style="background:rgba(35,135,115,${.02 + Number(cell.percentage || 0)/400})"><strong>${cell.count}</strong><span>${cell.percentage == null ? "無有效配對" : `${cell.percentage}%`}</span></td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
load();
