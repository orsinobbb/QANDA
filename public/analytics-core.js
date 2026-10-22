/* Shared by the report page and the Apps Script deployment bundle. */
var QandaAnalytics = (() => {
  function aggregate(survey, responses, settings = {}) {
    const seen = new Set();
    const records = responses.filter(item => {
      if (!item.sessionId || seen.has(item.sessionId) || item.status !== "submitted") return false;
      seen.add(item.sessionId);
      return true;
    });
    const questions = survey.questions.filter(q => ["single", "multiple"].includes(q.type));
    const values = (record, question) => {
      const answer = record.answers && record.answers[question.id];
      const candidates = question.type === "multiple" ? (Array.isArray(answer) ? answer : []) : [answer];
      return [...new Set(candidates)].filter(value => question.options.some(option => option.value === value));
    };
    const percent = (count, total) => total ? Math.round(count * 1000 / total) / 10 : null;
    const minimum = Math.max(5, Number(survey.analytics?.minimumPublicResponses) || 5);
    const base = {questionnaireId:survey.id, title:survey.title, version:Number(survey.lifecycle?.version || 1), total:records.length, withheld:Boolean(settings.public && records.length < minimum), minimum, updatedAt:new Date().toISOString()};
    if (base.withheld) return {...base, distributions:[], crossTabs:[]};
    const distributions = questions.map(question => {
      const answers = records.map(record => values(record, question));
      const answered = answers.filter(answer => answer.length).length;
      return {id:question.id, title:question.title || question.prompt, multiple:question.type === "multiple", answered, missing:records.length - answered,
        options:question.options.map(option => {
          const count = answers.filter(answer => answer.includes(option.value)).length;
          return {value:option.value, label:option.label, count, percentage:percent(count, answered)};
        })};
    });
    const crossTabs = (survey.analytics?.crossTabs || []).map(pair => {
      const rowQuestion = questions.find(q => q.id === pair.row);
      const colQuestion = questions.find(q => q.id === pair.column);
      if (!rowQuestion || !colQuestion) return null;
      const pairs = records.map(record => ({row:values(record,rowQuestion), column:values(record,colQuestion)})).filter(item => item.row.length && item.column.length);
      return {row:pair.row, column:pair.column, title:`${rowQuestion.title} × ${colQuestion.title}`, paired:pairs.length, missing:records.length - pairs.length, multiple:colQuestion.type === "multiple" || rowQuestion.type === "multiple",
        columns:colQuestion.options.map(option => ({value:option.value,label:option.label})),
        rows:rowQuestion.options.map(option => {
          const members = pairs.filter(item => item.row.includes(option.value));
          return {value:option.value,label:option.label,total:members.length,cells:colQuestion.options.map(col => {
            const count = members.filter(item => item.column.includes(col.value)).length;
            return {count,percentage:percent(count,members.length)};
          })};
        })};
    }).filter(Boolean);
    return {...base, distributions, crossTabs};
  }
  function aiPrompt(data) {
    return `你是協助老師設計第一堂課的教學助理。以下為班級問卷彙整，不含姓名或個別回答。數值已由程式計算，請勿自行改寫數字、補造資料或將關聯當成因果。這是自願填答的班級樣本，不能代表所有學員，也不能以年齡推定能力。多選題比例以有效填答人數為分母，合計可能超過 100%。\n請輸出：1. 三項觀察，每項引用題目、樣本數、比例；2. 兩項教學建議，分清事實與假設；3. 一項值得再問的問題；4. 小樣本、自評與未填答的限制。不足以推論時請明說。\n${JSON.stringify(data, null, 2)}`;
  }
  return {aggregate, aiPrompt};
})();
