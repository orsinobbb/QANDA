const state = {
  questionnaires: [],
  adminQuestionnaires: [],
  adminSurvey: null,
  questionnaire: null,
  session: null,
  answers: {},
  clientRevision: 0,
  syncTimer: null,
  tickTimer: null,
  localDraft: null,
  activeQuestionId: null,
  resultSource: "local",
  remoteResults: []
};

const SHEET_ADMIN_TOKEN_KEY = "qanda:sheet-admin-token";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  preflightStage: $("#preflightStage"),
  activeStage: $("#activeStage"),
  previewTitle: $("#previewTitle"),
  previewDescription: $("#previewDescription"),
  previewDuration: $("#previewDuration"),
  previewQuestionCount: $("#previewQuestionCount"),
  directLinkHint: $("#directLinkHint"),
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
  syncQuestionBankButton: $("#syncQuestionBankButton"),
  saveJsonButton: $("#saveJsonButton"),
  lifecycleTitle: $("#lifecycleTitle"),
  lifecycleStatus: $("#lifecycleStatus"),
  lifecycleVersion: $("#lifecycleVersion"),
  lifecycleTrail: $("#lifecycleTrail"),
  lifecycleMeta: $("#lifecycleMeta"),
  lifecycleActions: $("#lifecycleActions"),
  lifecycleMessage: $("#lifecycleMessage"),
  shareLinkInput: $("#shareLinkInput"),
  copyShareLinkButton: $("#copyShareLinkButton"),
  openShareLinkButton: $("#openShareLinkButton"),
  aiTitleInput: $("#aiTitleInput"),
  aiDurationInput: $("#aiDurationInput"),
  aiPromptInput: $("#aiPromptInput"),
  generateButton: $("#generateButton"),
  aiMessage: $("#aiMessage"),
  resultStatusFilter: $("#resultStatusFilter"),
  resultKeywordInput: $("#resultKeywordInput"),
  searchResultsButton: $("#searchResultsButton"),
  exportButton: $("#exportButton"),
  sheetAdminTokenInput: $("#sheetAdminTokenInput"),
  connectSheetButton: $("#connectSheetButton"),
  disconnectSheetButton: $("#disconnectSheetButton"),
  resultSourceStatus: $("#resultSourceStatus"),
  resultsBody: $("#resultsBody"),
  resultDetail: $("#resultDetail")
};

init();

async function init() {
  bindEvents();
  elements.sheetAdminTokenInput.value = sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY) || "";
  await Promise.all([checkHealth(), loadQuestionnaires()]);
  await loadAdminSurvey();
  await loadResults();
}

function bindEvents() {
  $$(".view-switcher button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  elements.questionnaireSelect.addEventListener("change", handleSurveySelection);
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
  elements.syncQuestionBankButton.addEventListener("click", syncQuestionBank);
  elements.lifecycleActions.addEventListener("click", handleLifecycleAction);
  elements.copyShareLinkButton.addEventListener("click", copyShareLink);
  elements.openShareLinkButton.addEventListener("click", openShareLink);
  elements.generateButton.addEventListener("click", generateQuestionnaire);
  elements.searchResultsButton.addEventListener("click", loadResults);
  elements.exportButton.addEventListener("click", exportResults);
  elements.connectSheetButton.addEventListener("click", connectSheetAdmin);
  elements.disconnectSheetButton.addEventListener("click", disconnectSheetAdmin);
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

async function loadQuestionnaires(preferredAdminId = "") {
  const previousSurveyId = elements.questionnaireSelect.value;
  const previousAdminId = preferredAdminId || elements.adminQuestionnaireSelect.value;
  const [publicData, adminData] = await Promise.all([
    api("/api/questionnaires"),
    api("/api/questionnaires?scope=admin")
  ]);
  state.questionnaires = publicData.questionnaires || [];
  state.adminQuestionnaires = adminData.questionnaires || [];
  fillSelect(elements.questionnaireSelect, state.questionnaires);
  fillSelect(elements.adminQuestionnaireSelect, state.adminQuestionnaires, true);
  fillSelect(elements.resultQuestionnaireFilter, [{ id: "", title: "全部問卷" }, ...state.adminQuestionnaires]);

  const directSurveyId = new URLSearchParams(window.location.search).get("survey");
  const selectedSurveyId = [directSurveyId, previousSurveyId, state.questionnaires[0]?.id]
    .find((id) => id && state.questionnaires.some((item) => item.id === id));
  if (selectedSurveyId) elements.questionnaireSelect.value = selectedSurveyId;
  const selectedAdminId = [previousAdminId, directSurveyId, state.adminQuestionnaires[0]?.id]
    .find((id) => id && state.adminQuestionnaires.some((item) => item.id === id));
  if (selectedAdminId) elements.adminQuestionnaireSelect.value = selectedAdminId;
  elements.directLinkHint.classList.toggle("hidden", !directSurveyId || directSurveyId !== selectedSurveyId);
  renderSurveyPreview();
}

function fillSelect(select, items, includeLifecycle = false) {
  select.innerHTML = items.map((item) => {
    const suffix = includeLifecycle ? ` · ${lifecycleLabel(item.lifecycle?.status || "published")}` : "";
    return `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title + suffix)}</option>`;
  }).join("");
}

function handleSurveySelection() {
  const params = new URLSearchParams(window.location.search);
  params.set("survey", elements.questionnaireSelect.value);
  window.history.replaceState({}, "", `${window.location.pathname}?${params}${window.location.hash}`);
  elements.directLinkHint.classList.remove("hidden");
  renderSurveyPreview();
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
    const sheetSync = await syncSubmittedResult(data);
    setSyncStatus(sheetSync);
    await loadResults();
  } catch (error) {
    setSyncStatus(error.message);
    elements.submitButton.disabled = false;
  } finally {
    elements.confirmSubmitButton.disabled = false;
  }
}

async function syncSubmittedResult(data) {
  const endpoint = String(window.QANDA_CONFIG?.googleAppsScriptUrl || "").trim();
  if (!endpoint) return "已正式提交；Google Sheet 尚未設定";
  const payload = {
    event: "result.submitted",
    schemaVersion: 1,
    source: window.location.origin,
    sentAt: new Date().toISOString(),
    session: data.session,
    questionnaire: {
      id: data.questionnaire.id,
      title: data.questionnaire.title
    },
    answers: data.session.answers || {},
    result: data.session.result,
    aiLogs: data.session.aiLogs || []
  };
  const request = {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow"
  };
  try {
    const response = await fetch(endpoint, request);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "Google Sheet 拒絕寫入");
    return result.duplicate ? "已正式提交；Google Sheet 已有此結果" : "已正式提交並同步 Google Sheet";
  } catch (error) {
    try {
      await fetch(endpoint, { ...request, mode: "no-cors" });
      return "已正式提交；Google Sheet 同步已送出待確認";
    } catch (_) {
      return `已正式提交；Google Sheet 同步失敗：${error.message}`;
    }
  }
}

function renderResult(result, logs) {
  elements.resultPanel.classList.remove("hidden");
  const scoreText = `${result.score}/${result.maxScore}`;
  const outcome = result.proficiency
    ? { title: result.proficiency.label, next: result.proficiency.recommendation }
    : result.percentage >= 80
      ? { title: "已達成本次標準", next: "你可以查看各題回饋，確認哪些判斷已掌握、哪些仍值得複習。" }
      : result.percentage >= 60
        ? { title: "已完成，建議補強", next: "部分題目仍有改善空間，建議先查看各題回饋，再安排補強。" }
        : { title: "需要進一步補強", next: "建議依各題回饋重新確認關鍵內容，完成補強後再進行一次驗證。" };
  const leafResults = flattenResultItems(result.questionResults);
  const correctCount = leafResults.filter((item) => item.status === "correct").length;
  const competencyProfile = Array.isArray(result.competencies) && result.competencies.length
    ? `
      <section class="competency-profile">
        <h3>能力面向</h3>
        <div class="competency-list">
          ${result.competencies.map((item) => `
            <div class="competency-row">
              <div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.score)} / ${escapeHtml(item.maxScore)}</span></div>
              <div class="competency-track"><span style="width:${Math.max(0, Math.min(100, Number(item.percentage || 0)))}%"></span></div>
              <b>${escapeHtml(item.percentage)}%</b>
            </div>`).join("")}
        </div>
      </section>`
    : "";
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
    ${competencyProfile}
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
    state.adminSurvey = data.questionnaire;
    elements.jsonEditor.value = JSON.stringify(data.questionnaire, null, 2);
    renderLifecycle(data.questionnaire);
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
    await loadQuestionnaires(data.questionnaire.id);
    await loadAdminSurvey();
  } catch (error) {
    setMessage(elements.jsonMessage, error.message, "error");
  }
}

function renderLifecycle(questionnaire) {
  const lifecycle = questionnaire.lifecycle || { status: "published", version: 1, audit: [] };
  const status = lifecycle.status || "published";
  const stages = ["draft", "review", "published", "closed", "archived"];
  const activeIndex = stages.indexOf(status);
  elements.lifecycleTitle.textContent = questionnaire.title;
  elements.lifecycleStatus.textContent = lifecycleLabel(status);
  elements.lifecycleStatus.className = `status lifecycle-${status}`;
  elements.lifecycleVersion.textContent = `第 ${Number(lifecycle.version || 1)} 版`;
  elements.lifecycleTrail.innerHTML = stages.map((stage, index) => `
    <li class="${index < activeIndex ? "complete" : ""} ${stage === status ? "active" : ""}">
      <span>${index + 1}</span>
      <strong>${escapeHtml(lifecycleLabel(stage))}</strong>
    </li>`).join("");

  const shareUrl = buildShareUrl(questionnaire.id);
  elements.shareLinkInput.value = shareUrl;
  elements.copyShareLinkButton.disabled = status !== "published";
  elements.openShareLinkButton.disabled = status !== "published";
  const audit = Array.isArray(lifecycle.audit) ? lifecycle.audit : [];
  const latest = audit.at(-1);
  elements.lifecycleMeta.innerHTML = `
    <span>負責人 <strong>${escapeHtml(lifecycle.owner || "未指定")}</strong></span>
    <span>更新 <strong>${escapeHtml(formatTime(lifecycle.updatedAt || lifecycle.createdAt))}</strong></span>
    <span>稽核 <strong>${audit.length} 筆${latest?.actor ? ` · ${escapeHtml(latest.actor)}` : ""}</strong></span>`;
  elements.lifecycleActions.innerHTML = lifecycleTransitions(status).map((action) => `
    <button type="button" data-lifecycle-status="${escapeHtml(action.status)}" class="${action.primary ? "primary" : ""}">
      ${escapeHtml(action.label)}
    </button>`).join("");
  setMessage(elements.lifecycleMessage, status === "published" ? "問卷已開放，作答者可透過獨立連結進入。" : "此狀態不接受新的作答。", status === "published" ? "success" : "");
}

function lifecycleTransitions(status) {
  return {
    draft: [{ status: "review", label: "送交審核", primary: true }],
    review: [
      { status: "draft", label: "退回草稿" },
      { status: "published", label: "核准發布", primary: true }
    ],
    published: [{ status: "closed", label: "關閉作答" }],
    closed: [
      { status: "published", label: "重新開放", primary: true },
      { status: "archived", label: "封存問卷" }
    ],
    archived: [{ status: "closed", label: "取消封存" }]
  }[status] || [];
}

async function handleLifecycleAction(event) {
  const button = event.target.closest("button[data-lifecycle-status]");
  if (!button || !state.adminSurvey) return;
  const nextStatus = button.dataset.lifecycleStatus;
  if (["closed", "archived"].includes(nextStatus) && !window.confirm(`確定要${lifecycleLabel(nextStatus)}「${state.adminSurvey.title}」嗎？`)) return;
  button.disabled = true;
  setMessage(elements.lifecycleMessage, "正在更新問卷狀態");
  try {
    const data = await api(`/api/questionnaires/${state.adminSurvey.id}/lifecycle`, {
      method: "PATCH",
      body: {
        status: nextStatus,
        actor: "questionnaire-admin",
        note: `管理端變更為${lifecycleLabel(nextStatus)}`
      }
    });
    await loadQuestionnaires(data.questionnaire.id);
    await loadAdminSurvey();
  } catch (error) {
    setMessage(elements.lifecycleMessage, error.message, "error");
    button.disabled = false;
  }
}

function buildShareUrl(questionnaireId) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("survey", questionnaireId);
  return url.toString();
}

async function copyShareLink() {
  if (!elements.shareLinkInput.value) return;
  try {
    await navigator.clipboard.writeText(elements.shareLinkInput.value);
  } catch {
    elements.shareLinkInput.select();
    document.execCommand("copy");
  }
  setMessage(elements.lifecycleMessage, "已複製獨立作答連結。", "success");
}

function openShareLink() {
  if (elements.shareLinkInput.value) window.open(elements.shareLinkInput.value, "_blank", "noopener");
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
  const filters = {
    questionnaireId: elements.resultQuestionnaireFilter.value,
    status: elements.resultStatusFilter.value,
    keyword: elements.resultKeywordInput.value.trim(),
    limit: 500
  };
  let data;
  const token = sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY);
  if (configuredSheetEndpoint() && token) {
    try {
      const response = await sheetAdminApi("admin.results.list", { filters });
      data = response.data;
      state.resultSource = "google-sheet";
      state.remoteResults = data.results || [];
      elements.resultSourceStatus.textContent = `Google Sheet 集中結果 · ${data.total} 筆`;
      elements.resultSourceStatus.className = "source-status connected";
    } catch (error) {
      state.resultSource = "google-sheet";
      state.remoteResults = [];
      data = { results: [] };
      elements.resultSourceStatus.textContent = `Google Sheet 連線失敗：${error.message}`;
      elements.resultSourceStatus.className = "source-status error";
    }
  } else {
    const params = new URLSearchParams();
    if (filters.questionnaireId) params.set("questionnaireId", filters.questionnaireId);
    if (filters.status) params.set("status", filters.status);
    if (filters.keyword) params.set("keyword", filters.keyword);
    data = await api(`/api/results?${params}`);
    state.resultSource = "local";
    state.remoteResults = [];
    elements.resultSourceStatus.textContent = configuredSheetEndpoint()
      ? "目前顯示本機結果；輸入管理權杖可讀取集中結果"
      : "Google Sheet 尚未設定；目前顯示本機結果";
    elements.resultSourceStatus.className = "source-status";
  }
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
  const data = state.resultSource === "google-sheet"
    ? (await sheetAdminApi("admin.results.detail", { sessionId })).data
    : await api(`/api/results/${sessionId}`);
  const summary = data.summary;
  const competencyText = (data.competencies || []).map((item) => `${item.competencyLabel} ${item.percentage}%`).join(" · ");
  elements.resultDetail.innerHTML = `
    <strong>${escapeHtml(summary.participant.displayName)}</strong>
    · ${escapeHtml(summary.questionnaireTitle)}
    · ${escapeHtml(statusLabel(summary.status))}
    · 答案 ${escapeHtml(summary.answerCount)}
    · 同步 ${escapeHtml(summary.lastSyncAt ? formatTime(summary.lastSyncAt) : "--")}
    ${competencyText ? `<div class="result-detail-competencies">${escapeHtml(competencyText)}</div>` : ""}`;
}

function exportResults() {
  if (state.resultSource === "google-sheet") {
    exportRemoteResults();
    return;
  }
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

async function connectSheetAdmin() {
  const token = elements.sheetAdminTokenInput.value.trim();
  if (!token) {
    elements.resultSourceStatus.textContent = "請輸入管理權杖";
    elements.resultSourceStatus.className = "source-status error";
    return;
  }
  sessionStorage.setItem(SHEET_ADMIN_TOKEN_KEY, token);
  await loadResults();
}

async function disconnectSheetAdmin() {
  sessionStorage.removeItem(SHEET_ADMIN_TOKEN_KEY);
  elements.sheetAdminTokenInput.value = "";
  await loadResults();
}

async function syncQuestionBank() {
  if (!state.adminSurvey) return;
  if (!sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY)) {
    setMessage(elements.jsonMessage, "請先在結果搜尋區連線 Google Sheet。", "error");
    return;
  }
  elements.syncQuestionBankButton.disabled = true;
  setMessage(elements.jsonMessage, "正在同步題庫");
  try {
    const response = await sheetAdminApi("admin.question-bank.import", { questionnaire: state.adminSurvey });
    const result = response.data;
    setMessage(elements.jsonMessage, `題庫同步完成：新增 ${result.importedQuestions} 題，建立 ${result.linkedItems} 筆組卷關係。`, "success");
  } catch (error) {
    setMessage(elements.jsonMessage, error.message, "error");
  } finally {
    elements.syncQuestionBankButton.disabled = false;
  }
}

async function sheetAdminApi(event, payload = {}) {
  const endpoint = configuredSheetEndpoint();
  const adminToken = sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY) || "";
  if (!endpoint) throw new Error("Google Sheet 尚未設定");
  if (!adminToken) throw new Error("缺少管理權杖");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ event, adminToken, ...payload }),
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Google Sheet 管理查詢失敗");
  return data;
}

function configuredSheetEndpoint() {
  return String(window.QANDA_CONFIG?.googleAppsScriptUrl || "").trim();
}

function exportRemoteResults() {
  const headers = ["sessionId", "questionnaireId", "questionnaireTitle", "personId", "displayName", "group", "status", "score", "maxScore", "percentage", "startedAt", "submittedAt", "lastSyncAt"];
  const rows = state.remoteResults.map((row) => ({
    sessionId: row.id,
    questionnaireId: row.questionnaireId,
    questionnaireTitle: row.questionnaireTitle,
    personId: row.participant.personId,
    displayName: row.participant.displayName,
    group: row.participant.group,
    status: row.status,
    score: row.score,
    maxScore: row.maxScore,
    percentage: row.percentage,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    lastSyncAt: row.lastSyncAt
  }));
  const csv = `\ufeff${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")).join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "qanda-google-sheet-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-Hant", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function lifecycleLabel(status) {
  return (
    {
      draft: "草稿",
      review: "審核中",
      published: "已發布",
      closed: "已關閉",
      archived: "已封存"
    }[status] || status
  );
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
