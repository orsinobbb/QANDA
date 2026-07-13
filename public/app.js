const state = {
  questionnaires: [],
  questionnaire: null,
  session: null,
  answers: {},
  clientRevision: 0,
  syncTimer: null,
  tickTimer: null,
  localDraft: null,
  activeQuestionId: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  preflightStage: $("#preflightStage"),
  activeStage: $("#activeStage"),
  previewTitle: $("#previewTitle"),
  previewDescription: $("#previewDescription"),
  previewDuration: $("#previewDuration"),
  previewQuestionCount: $("#previewQuestionCount"),
  healthStatus: $("#healthStatus"),
  questionnaireSelect: $("#questionnaireSelect"),
  adminQuestionnaireSelect: $("#adminQuestionnaireSelect"),
  resultQuestionnaireFilter: $("#resultQuestionnaireFilter"),
  personIdInput: $("#personIdInput"),
  serialInput: $("#serialInput"),
  startButton: $("#startButton"),
  accessMessage: $("#accessMessage"),
  sidebarParticipant: $("#sidebarParticipant"),
  sidebarParticipantId: $("#sidebarParticipantId"),
  sidebarProgressText: $("#sidebarProgressText"),
  progressFill: $("#progressFill"),
  questionNav: $("#questionNav"),
  sidebarSyncStatus: $("#sidebarSyncStatus"),
  sessionBar: $("#sessionBar"),
  sessionStep: $("#sessionStep"),
  sessionTitle: $("#sessionTitle"),
  sessionMeta: $("#sessionMeta"),
  timerLabel: $("#timerLabel"),
  timerDisplay: $("#timerDisplay"),
  questionForm: $("#questionForm"),
  answerActions: $("#answerActions"),
  syncStatus: $("#syncStatus"),
  progressStatus: $("#progressStatus"),
  submitButton: $("#submitButton"),
  syncButton: $("#syncButton"),
  resultPanel: $("#resultPanel"),
  memoryBanner: $("#memoryBanner"),
  restoreDraftButton: $("#restoreDraftButton"),
  submitDialog: $("#submitDialog"),
  submitSummary: $("#submitSummary"),
  submitReview: $("#submitReview"),
  cancelSubmitButton: $("#cancelSubmitButton"),
  confirmSubmitButton: $("#confirmSubmitButton"),
  jsonEditor: $("#jsonEditor"),
  jsonMessage: $("#jsonMessage"),
  reloadJsonButton: $("#reloadJsonButton"),
  saveJsonButton: $("#saveJsonButton"),
  aiTitleInput: $("#aiTitleInput"),
  aiDurationInput: $("#aiDurationInput"),
  aiPromptInput: $("#aiPromptInput"),
  generateButton: $("#generateButton"),
  aiMessage: $("#aiMessage"),
  resultStatusFilter: $("#resultStatusFilter"),
  resultKeywordInput: $("#resultKeywordInput"),
  searchResultsButton: $("#searchResultsButton"),
  exportButton: $("#exportButton"),
  resultsBody: $("#resultsBody"),
  resultDetail: $("#resultDetail")
};

init();

async function init() {
  bindEvents();
  await Promise.all([checkHealth(), loadQuestionnaires()]);
  await loadAdminSurvey();
  await loadResults();
}

function bindEvents() {
  $$(".view-switcher button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  elements.questionnaireSelect.addEventListener("change", renderSurveyPreview);
  elements.startButton.addEventListener("click", startSession);
  elements.questionForm.addEventListener("input", handleAnswerInput);
  elements.questionNav.addEventListener("click", handleQuestionNavigation);
  elements.syncButton.addEventListener("click", () => syncAnswers("manual"));
  elements.submitButton.addEventListener("click", openSubmitReview);
  elements.cancelSubmitButton.addEventListener("click", closeSubmitReview);
  elements.confirmSubmitButton.addEventListener("click", submitAnswers);
  elements.restoreDraftButton.addEventListener("click", restoreLocalDraft);
  elements.adminQuestionnaireSelect.addEventListener("change", loadAdminSurvey);
  elements.reloadJsonButton.addEventListener("click", loadAdminSurvey);
  elements.saveJsonButton.addEventListener("click", saveAdminSurvey);
  elements.generateButton.addEventListener("click", generateQuestionnaire);
  elements.searchResultsButton.addEventListener("click", loadResults);
  elements.exportButton.addEventListener("click", exportResults);
}

function showView(view) {
  $$(".view-switcher button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#answerView").classList.toggle("active", view === "answer");
  $("#adminView").classList.toggle("active", view === "admin");
  if (view === "admin") loadResults();
}

async function checkHealth() {
  try {
    await api("/api/health");
    elements.healthStatus.textContent = "可連線";
  } catch {
    elements.healthStatus.textContent = "離線";
  }
}

async function loadQuestionnaires() {
  const data = await api("/api/questionnaires");
  state.questionnaires = data.questionnaires || [];
  fillSelect(elements.questionnaireSelect, state.questionnaires);
  fillSelect(elements.adminQuestionnaireSelect, state.questionnaires);
  fillSelect(elements.resultQuestionnaireFilter, [{ id: "", title: "全部問卷" }, ...state.questionnaires]);
  renderSurveyPreview();
}

function fillSelect(select, items) {
  select.innerHTML = items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join("");
}

function renderSurveyPreview() {
  const survey = state.questionnaires.find((item) => item.id === elements.questionnaireSelect.value);
  if (!survey) return;
  elements.previewTitle.textContent = survey.title;
  elements.previewDescription.textContent = survey.description || "這份問卷將依序引導你完成作答，提交前可檢查所有答案。";
  elements.previewDuration.textContent = `${Math.ceil(Number(survey.durationSeconds || 0) / 60)} 分鐘`;
  elements.previewQuestionCount.textContent = `${Number(survey.questionCount || 0)} 題`;
}

async function startSession() {
  setMessage(elements.accessMessage, "驗證中");
  elements.startButton.disabled = true;
  elements.startButton.textContent = "正在驗證";
  try {
    const payload = {
      questionnaireId: elements.questionnaireSelect.value,
      personId: elements.personIdInput.value.trim(),
      serial: elements.serialInput.value.trim()
    };
    const data = await api("/api/sessions/start", { method: "POST", body: payload });
    loadSessionData(data);
    setMessage(elements.accessMessage, data.event === "resumed" ? "已接續未完成作答。" : "問卷已啟動。", "success");
  } catch (error) {
    setMessage(elements.accessMessage, error.message, "error");
  } finally {
    elements.startButton.disabled = false;
    elements.startButton.textContent = "驗證並開始作答";
  }
}

function loadSessionData(data) {
  state.session = data.session;
  state.questionnaire = data.questionnaire;
  state.answers = { ...(data.session.answers || {}) };
  state.clientRevision = Number(data.session.memory?.clientRevision || 0);
  elements.preflightStage.classList.add("hidden");
  elements.activeStage.classList.remove("hidden");
  elements.sessionBar.classList.remove("hidden");
  elements.resultPanel.classList.toggle("hidden", !state.session.result);
  renderQuestions();
  renderSession();
  inspectLocalDraft();
  startTimer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSession() {
  elements.sessionTitle.textContent = state.questionnaire.title;
  const participant = state.session.participant;
  elements.sessionMeta.textContent = `${participant.displayName} · ${participant.personId} · ${statusLabel(state.session.status)}`;
  elements.sidebarParticipant.textContent = participant.displayName;
  elements.sidebarParticipantId.textContent = `${participant.personId}${participant.group ? ` · ${participant.group}` : ""}`;
  setSyncStatus(state.session.memory?.lastSyncAt
    ? `後端已同步 ${formatTime(state.session.memory.lastSyncAt)}`
    : "尚未同步");
  updateProgress();
  if (state.session.result) renderResult(state.session.result, state.session.aiLogs || []);
  const closed = state.session.status !== "in_progress";
  const submitted = state.session.status === "submitted";
  elements.sessionStep.textContent = submitted
    ? "步驟 3 / 3 · 已完成"
    : state.session.status === "expired"
      ? "作答已結束"
      : "步驟 2 / 3 · 作答中";
  elements.timerLabel.textContent = closed ? "作答狀態" : "剩餘時間";
  elements.questionForm.toggleAttribute("inert", closed);
  elements.submitButton.disabled = closed;
  elements.syncButton.disabled = closed;
  elements.questionForm.classList.toggle("hidden", submitted);
  elements.answerActions.classList.toggle("hidden", submitted);
  elements.activeStage.classList.toggle("completed", submitted);
  if (closed) stopTimer();
  renderTimerState();
}

function renderQuestions() {
  elements.questionForm.innerHTML = state.questionnaire.questions.map((question, index) => renderQuestion(question, `${index + 1}`, false)).join("");
  renderQuestionNavigation();
  hydrateInputs();
}

function renderQuestionNavigation() {
  const items = flattenQuestionMeta(state.questionnaire.questions);
  state.activeQuestionId = state.activeQuestionId || items[0]?.id || null;
  elements.questionNav.innerHTML = items
    .map(
      (item) => `
        <button type="button" data-target="${escapeHtml(item.id)}" class="${item.id === state.activeQuestionId ? "active" : ""}">
          <span class="nav-number">${escapeHtml(item.number)}</span>
          <span class="nav-title">${escapeHtml(item.title)}</span>
          <span class="nav-state" aria-hidden="true"></span>
        </button>`
    )
    .join("");
}

function flattenQuestionMeta(questions, prefix = "") {
  const items = [];
  questions.forEach((question, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    if (question.type === "composite") {
      items.push(...flattenQuestionMeta(question.questions || [], number));
    } else {
      items.push({ id: question.id, number, title: question.title || question.prompt });
    }
  });
  return items;
}

function handleQuestionNavigation(event) {
  const button = event.target.closest("button[data-target]");
  if (!button) return;
  const target = elements.questionForm.querySelector(`[data-question="${cssEscape(button.dataset.target)}"]`);
  if (!target) return;
  state.activeQuestionId = button.dataset.target;
  elements.questionNav.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderQuestion(question, number, nested) {
  const typeLabel = {
    boolean: "是非題",
    single: "單選題",
    multiple: "多選題",
    short: "簡答題",
    composite: "複合式"
  }[question.type] || question.type;
  const head = `
    <div class="question-head">
      <div class="question-meta">
        <small>${escapeHtml(number)} · ${escapeHtml(typeLabel)} · ${Number(question.maxScore || childMaxScore(question))} 分</small>
        <span class="question-status" data-question-state="${escapeHtml(question.id)}">未作答</span>
      </div>
      <h2>${escapeHtml(question.title || question.prompt)}</h2>
      <p>${escapeHtml(question.prompt)}</p>
    </div>`;

  if (question.type === "composite") {
    return `
      <section class="question-card composite" data-question="${escapeHtml(question.id)}">
        ${head}
        <div class="child-questions">
          ${(question.questions || []).map((child, childIndex) => renderQuestion(child, `${number}.${childIndex + 1}`, true)).join("")}
        </div>
      </section>`;
  }

  return `
    <section class="${nested ? "sub-question" : "question-card"}" data-question="${escapeHtml(question.id)}">
      ${head}
      ${renderControl(question)}
    </section>`;
}

function renderControl(question) {
  if (question.type === "boolean") {
    return `
      <div class="boolean-row">
        <label class="option"><input type="radio" name="${escapeHtml(question.id)}" data-choice="true" data-qid="${escapeHtml(question.id)}" value="true" />是</label>
        <label class="option"><input type="radio" name="${escapeHtml(question.id)}" data-choice="true" data-qid="${escapeHtml(question.id)}" value="false" />否</label>
      </div>`;
  }
  if (question.type === "single") {
    return `<div class="options">${(question.options || [])
      .map((option) => renderChoiceOption(question, option, "radio"))
      .join("")}</div>`;
  }
  if (question.type === "multiple") {
    return `<div class="options">${(question.options || [])
      .map((option) => renderChoiceOption(question, option, "checkbox"))
      .join("")}</div>`;
  }
  if (question.type === "short") {
    return `<textarea data-qid="${escapeHtml(question.id)}" rows="5" placeholder="輸入答案"></textarea>`;
  }
  return "";
}

function renderChoiceOption(question, option, type) {
  const nameAttr = type === "radio" ? ` name="${escapeHtml(question.id)}"` : "";
  const textInput = option.allowText
    ? `<input class="option-text-input" data-qid="${escapeHtml(question.id)}" data-option-text="true" data-option-value="${escapeHtml(option.value)}" placeholder="${escapeHtml(option.textPlaceholder || "自行填寫")}" />`
    : "";
  return `
    <label class="option ${option.allowText ? "option-with-text" : ""}">
      <input type="${type}"${nameAttr} data-choice="true" data-qid="${escapeHtml(question.id)}" value="${escapeHtml(option.value)}" />
      <span class="option-content">
        <span>${escapeHtml(option.label)}</span>
        ${textInput}
      </span>
    </label>`;
}

function hydrateInputs() {
  for (const [id, value] of Object.entries(state.answers)) {
    const inputs = $$(`[data-qid="${cssEscape(id)}"]`);
    for (const input of inputs) {
      if (input.dataset.optionText === "true") input.value = choiceTextFor(value, input.dataset.optionValue);
      else if (input.type === "radio") input.checked = answerHasChoice(value, inputValue(input.value));
      else if (input.type === "checkbox") input.checked = answerHasChoice(value, inputValue(input.value));
      else input.value = value ?? "";
    }
  }
}

function handleAnswerInput(event) {
  const target = event.target;
  const id = target.dataset.qid;
  if (!id || state.session?.status !== "in_progress") return;
  if (target.dataset.optionText === "true") {
    const choice = choiceInputFor(id, target.dataset.optionValue);
    if (choice) choice.checked = true;
    state.answers[id] = collectChoiceAnswer(id);
  } else if (target.type === "checkbox") {
    state.answers[id] = collectChoiceAnswer(id);
  } else if (target.type === "radio") {
    state.answers[id] = collectChoiceAnswer(id);
  } else {
    state.answers[id] = target.value;
  }
  state.clientRevision += 1;
  saveLocalDraft();
  updateProgress();
  scheduleSync();
}

function collectChoiceAnswer(id) {
  const choices = $$(`input[data-choice="true"][data-qid="${cssEscape(id)}"]`);
  const checked = choices.filter((input) => input.checked);
  if (!checked.length) return undefined;
  if (choices.some((input) => input.type === "checkbox")) {
    return checked.map(choiceAnswerFromInput);
  }
  return choiceAnswerFromInput(checked[0]);
}

function choiceAnswerFromInput(input) {
  const value = inputValue(input.value);
  const textInput = optionTextInput(input.dataset.qid, input.value);
  if (!textInput) return value;
  return {
    value,
    text: textInput.value.trim()
  };
}

function optionTextInput(id, value) {
  return $(`input[data-option-text="true"][data-qid="${cssEscape(id)}"][data-option-value="${cssEscape(value)}"]`);
}

function choiceInputFor(id, value) {
  return $(`input[data-choice="true"][data-qid="${cssEscape(id)}"][value="${cssEscape(value)}"]`);
}

function choiceTextFor(answer, optionValue) {
  const values = Array.isArray(answer) ? answer : [answer];
  const found = values.find((item) => item && typeof item === "object" && String(item.value) === String(inputValue(optionValue)));
  return found?.text || "";
}

function answerHasChoice(answer, choiceValue) {
  const values = Array.isArray(answer) ? answer : [answer];
  return values.some((item) => {
    const value = item && typeof item === "object" ? item.value : item;
    return value === choiceValue;
  });
}

function inputValue(value) {
  return value === "true" ? true : value === "false" ? false : value;
}

function scheduleSync() {
  setSyncStatus("本機已保存，等待同步");
  window.clearTimeout(state.syncTimer);
  state.syncTimer = window.setTimeout(() => syncAnswers("autosave"), 700);
}

async function syncAnswers(phase = "autosave") {
  if (!state.session || state.session.status !== "in_progress") return;
  try {
    const data = await api(`/api/sessions/${state.session.id}/answers`, {
      method: "PUT",
      body: {
        answers: state.answers,
        phase,
        clientRevision: state.clientRevision,
        clientSavedAt: new Date().toISOString()
      }
    });
    state.session = data.session;
    clearLocalDraft();
    renderSession();
  } catch (error) {
    setSyncStatus(error.message);
    if (error.message.includes("結束") || error.message.includes("送出")) {
      state.session.status = "expired";
      renderSession();
    }
  }
}

function openSubmitReview() {
  if (!state.session || state.session.status !== "in_progress") return;
  const items = flattenQuestionMeta(state.questionnaire.questions);
  const unanswered = items.filter((item) => !isAnswered(state.answers[item.id]));
  const answeredCount = items.length - unanswered.length;
  elements.submitSummary.textContent = unanswered.length
    ? `已完成 ${answeredCount} 題，還有 ${unanswered.length} 題尚未作答。`
    : `全部 ${items.length} 題都已完成，可以提交。`;
  elements.submitReview.innerHTML = `
    <div class="review-row">
      <strong>已完成</strong>
      <span>${answeredCount} / ${items.length} 題</span>
    </div>
    <div class="review-row ${unanswered.length ? "warning" : ""}">
      <strong>尚未作答</strong>
      <span>${unanswered.length ? unanswered.map((item) => item.number).join("、") : "無"}</span>
    </div>`;
  elements.confirmSubmitButton.textContent = unanswered.length ? "仍要確認送出" : "確認送出";
  elements.submitDialog.showModal();
}

function closeSubmitReview() {
  elements.submitDialog.close();
}

async function submitAnswers() {
  if (!state.session || state.session.status !== "in_progress") return;
  closeSubmitReview();
  elements.submitButton.disabled = true;
  elements.confirmSubmitButton.disabled = true;
  setSyncStatus("正在完成提交");
  try {
    const data = await api(`/api/sessions/${state.session.id}/submit`, {
      method: "POST",
      body: {
        answers: state.answers,
        clientRevision: state.clientRevision,
        clientSavedAt: new Date().toISOString()
      }
    });
    loadSessionData(data);
    clearLocalDraft();
    setSyncStatus("已正式提交");
    await loadResults();
  } catch (error) {
    setSyncStatus(error.message);
    elements.submitButton.disabled = false;
  } finally {
    elements.confirmSubmitButton.disabled = false;
  }
}

function renderResult(result, logs) {
  elements.resultPanel.classList.remove("hidden");
  const scoreText = `${result.score}/${result.maxScore}`;
  const outcome = result.percentage >= 80
    ? { title: "已達成本次標準", next: "你可以查看各題回饋，確認哪些判斷已掌握、哪些仍值得複習。" }
    : result.percentage >= 60
      ? { title: "已完成，建議補強", next: "部分題目仍有改善空間，建議先查看各題回饋，再安排補強。" }
      : { title: "需要進一步補強", next: "建議依各題回饋重新確認關鍵內容，完成補強後再進行一次驗證。" };
  const leafResults = flattenResultItems(result.questionResults);
  const correctCount = leafResults.filter((item) => item.status === "correct").length;
  elements.resultPanel.innerHTML = `
    <div class="score-hero">
      <div class="score-ring" style="--score:${result.percentage}%"><span>${result.percentage}%</span></div>
      <div>
        <div class="stage-label">步驟 3 / 3 · 已完成</div>
        <h2 class="result-outcome">${escapeHtml(outcome.title)}</h2>
        <p class="result-next-step">${escapeHtml(outcome.next)}</p>
        <div class="result-metrics">
          <div><span>總分</span><strong>${escapeHtml(scoreText)}</strong></div>
          <div><span>掌握題目</span><strong>${correctCount} / ${leafResults.length}</strong></div>
          <div><span>完成時間</span><strong>${escapeHtml(formatTime(result.gradedAt))}</strong></div>
          ${logs.length ? `<div><span>AI 評分紀錄</span><strong>${logs.length} 筆</strong></div>` : ""}
        </div>
      </div>
    </div>
    <h3 class="result-section-title">各題結果與回饋</h3>
    <div class="result-list">
      ${result.questionResults.map(renderResultItem).join("")}
    </div>`;
}

function flattenResultItems(items) {
  return items.flatMap((item) => item.children ? flattenResultItems(item.children) : [item]);
}

function renderResultItem(item) {
  const children = item.children ? `<div class="result-list">${item.children.map(renderResultItem).join("")}</div>` : "";
  return `
    <div class="result-item">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <div>${escapeHtml(item.comment || "")}</div>
        ${children}
      </div>
      <span class="status ${escapeHtml(item.status)}">${escapeHtml(item.score)} / ${escapeHtml(item.maxScore)}</span>
    </div>`;
}

function startTimer() {
  window.clearInterval(state.tickTimer);
  tick();
  if (state.session?.status === "in_progress") {
    state.tickTimer = window.setInterval(tick, 1000);
  }
}

function stopTimer() {
  window.clearInterval(state.tickTimer);
  state.tickTimer = null;
}

function tick() {
  if (!state.session) return;
  if (state.session.status !== "in_progress") {
    stopTimer();
    renderTimerState();
    return;
  }
  const remaining = Math.max(0, Math.ceil((new Date(state.session.expiresAt) - Date.now()) / 1000));
  elements.timerDisplay.textContent = formatDuration(remaining);
  elements.timerDisplay.classList.toggle("warning", remaining <= 60);
  if (remaining <= 0 && state.session.status === "in_progress") {
    state.session.status = "expired";
    renderSession();
    setSyncStatus("時間已結束，答案已停止接受");
    stopTimer();
  }
}

function renderTimerState() {
  if (!state.session) return;
  if (state.session.status === "submitted") {
    elements.timerDisplay.textContent = "已送出";
    elements.timerDisplay.classList.remove("warning");
    return;
  }
  if (state.session.status === "expired") {
    elements.timerDisplay.textContent = "00:00";
    elements.timerDisplay.classList.add("warning");
  }
}

function inspectLocalDraft() {
  state.localDraft = readLocalDraft();
  if (!state.localDraft) {
    elements.memoryBanner.classList.add("hidden");
    return;
  }
  const serverSync = state.session.memory?.lastSyncAt ? new Date(state.session.memory.lastSyncAt).getTime() : 0;
  const localSync = new Date(state.localDraft.updatedAt).getTime();
  const differs = JSON.stringify(state.localDraft.answers) !== JSON.stringify(state.answers);
  elements.memoryBanner.classList.toggle("hidden", !(differs && localSync > serverSync));
}

function restoreLocalDraft() {
  if (!state.localDraft) return;
  state.answers = { ...state.localDraft.answers };
  state.clientRevision = Math.max(state.clientRevision, Number(state.localDraft.clientRevision || 0)) + 1;
  hydrateInputs();
  updateProgress();
  elements.memoryBanner.classList.add("hidden");
  scheduleSync();
}

function saveLocalDraft() {
  if (!state.session) return;
  localStorage.setItem(
    draftKey(),
    JSON.stringify({
      answers: state.answers,
      clientRevision: state.clientRevision,
      updatedAt: new Date().toISOString()
    })
  );
}

function readLocalDraft() {
  if (!state.session) return null;
  try {
    return JSON.parse(localStorage.getItem(draftKey()) || "null");
  } catch {
    return null;
  }
}

function clearLocalDraft() {
  if (state.session) localStorage.removeItem(draftKey());
}

function draftKey() {
  return `draft:${state.session.questionnaireId}:${state.session.id}`;
}

async function loadAdminSurvey() {
  if (!elements.adminQuestionnaireSelect.value) return;
  try {
    const data = await api(`/api/questionnaires/${elements.adminQuestionnaireSelect.value}`);
    elements.jsonEditor.value = JSON.stringify(data.questionnaire, null, 2);
    setMessage(elements.jsonMessage, "已載入問卷。", "success");
  } catch (error) {
    setMessage(elements.jsonMessage, error.message, "error");
  }
}

async function saveAdminSurvey() {
  try {
    const questionnaire = JSON.parse(elements.jsonEditor.value);
    const data = await api("/api/questionnaires", { method: "POST", body: { questionnaire } });
    setMessage(elements.jsonMessage, `已儲存 ${data.questionnaire.title}`, "success");
    await loadQuestionnaires();
    elements.adminQuestionnaireSelect.value = data.questionnaire.id;
  } catch (error) {
    setMessage(elements.jsonMessage, error.message, "error");
  }
}

async function generateQuestionnaire() {
  setMessage(elements.aiMessage, "產生中");
  elements.generateButton.disabled = true;
  try {
    const data = await api("/api/ai/questionnaires", {
      method: "POST",
      body: {
        title: elements.aiTitleInput.value.trim(),
        durationMinutes: Number(elements.aiDurationInput.value || 15),
        prompt: elements.aiPromptInput.value.trim()
      }
    });
    elements.jsonEditor.value = JSON.stringify(data.questionnaire, null, 2);
    setMessage(
      elements.aiMessage,
      data.validationErrors?.length
        ? `已產生草稿，但需修正：${data.validationErrors.join("、")}`
        : `已產生草稿，provider: ${data.provider}`,
      data.validationErrors?.length ? "error" : "success"
    );
    showView("admin");
  } catch (error) {
    setMessage(elements.aiMessage, error.message, "error");
  } finally {
    elements.generateButton.disabled = false;
  }
}

async function loadResults() {
  const params = new URLSearchParams();
  if (elements.resultQuestionnaireFilter.value) params.set("questionnaireId", elements.resultQuestionnaireFilter.value);
  if (elements.resultStatusFilter.value) params.set("status", elements.resultStatusFilter.value);
  if (elements.resultKeywordInput.value.trim()) params.set("keyword", elements.resultKeywordInput.value.trim());
  const data = await api(`/api/results?${params}`);
  elements.resultsBody.innerHTML = data.results.length
    ? data.results.map(renderResultRow).join("")
    : `<tr><td colspan="5">尚無結果</td></tr>`;
  elements.resultsBody.querySelectorAll("tr[data-session]").forEach((row) => {
    row.addEventListener("click", () => loadResultDetail(row.dataset.session));
  });
}

function renderResultRow(row) {
  const score = row.score === null ? "--" : `${row.score}/${row.maxScore} (${row.percentage}%)`;
  return `
    <tr data-session="${escapeHtml(row.id)}">
      <td>${escapeHtml(row.participant.displayName)}<br><small>${escapeHtml(row.participant.personId)} · ${escapeHtml(row.participant.group || "-")}</small></td>
      <td>${escapeHtml(row.questionnaireTitle)}</td>
      <td><span class="status ${escapeHtml(row.status)}">${escapeHtml(statusLabel(row.status))}</span></td>
      <td>${escapeHtml(score)}</td>
      <td>${escapeHtml(formatTime(row.submittedAt || row.startedAt))}</td>
    </tr>`;
}

async function loadResultDetail(sessionId) {
  const data = await api(`/api/results/${sessionId}`);
  const summary = data.summary;
  elements.resultDetail.innerHTML = `
    <strong>${escapeHtml(summary.participant.displayName)}</strong>
    · ${escapeHtml(summary.questionnaireTitle)}
    · ${escapeHtml(statusLabel(summary.status))}
    · 答案 ${escapeHtml(summary.answerCount)}
    · 同步 ${escapeHtml(summary.lastSyncAt ? formatTime(summary.lastSyncAt) : "--")}`;
}

function exportResults() {
  if (window.__STATIC_API__?.exportResults) {
    window.__STATIC_API__.exportResults();
    return;
  }
  const params = new URLSearchParams();
  if (elements.resultQuestionnaireFilter.value) params.set("questionnaireId", elements.resultQuestionnaireFilter.value);
  if (elements.resultStatusFilter.value) params.set("status", elements.resultStatusFilter.value);
  if (elements.resultKeywordInput.value.trim()) params.set("keyword", elements.resultKeywordInput.value.trim());
  window.location.href = `/api/results/export.csv?${params}`;
}

function updateProgress() {
  if (!state.questionnaire) return;
  const items = flattenQuestionMeta(state.questionnaire.questions);
  const answered = items.filter((item) => isAnswered(state.answers[item.id])).length;
  const remaining = items.length - answered;
  const percentage = items.length ? Math.round((answered / items.length) * 100) : 0;
  elements.progressStatus.textContent = remaining ? `尚有 ${remaining} 題未完成` : "全部題目已完成";
  elements.sidebarProgressText.textContent = `${answered} / ${items.length}`;
  elements.progressFill.style.width = `${percentage}%`;
  elements.questionNav.querySelectorAll("button[data-target]").forEach((button) => {
    button.classList.toggle("answered", isAnswered(state.answers[button.dataset.target]));
  });
  updateQuestionVisualStates(state.questionnaire.questions);
}

function updateQuestionVisualStates(questions) {
  for (const question of questions) {
    const answered = question.type === "composite"
      ? (question.questions || []).every((child) => isQuestionAnswered(child))
      : isAnswered(state.answers[question.id]);
    const status = elements.questionForm.querySelector(`[data-question-state="${cssEscape(question.id)}"]`);
    if (status) {
      status.textContent = answered ? "已作答" : "未作答";
      status.classList.toggle("answered", answered);
    }
    if (question.type === "composite") updateQuestionVisualStates(question.questions || []);
  }
}

function isQuestionAnswered(question) {
  if (question.type === "composite") return (question.questions || []).every(isQuestionAnswered);
  return isAnswered(state.answers[question.id]);
}

function leafQuestionIds(questions) {
  return questions.flatMap((question) => (question.type === "composite" ? leafQuestionIds(question.questions || []) : [question.id]));
}

function isAnswered(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every(isAnswered);
  if (value && typeof value === "object") return value.value !== undefined && String(value.text || "").trim() !== "";
  return value !== undefined && value !== "";
}

function childMaxScore(question) {
  return (question.questions || []).reduce((sum, child) => sum + Number(child.maxScore || childMaxScore(child)), 0);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function setSyncStatus(text) {
  elements.syncStatus.textContent = text;
  elements.sidebarSyncStatus.textContent = text;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-Hant", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusLabel(status) {
  return (
    {
      in_progress: "作答中",
      submitted: "已送出",
      expired: "已逾時",
      correct: "正確",
      partial: "部分",
      incorrect: "錯誤",
      pending: "待評"
    }[status] || status
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}
