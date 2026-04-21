const LAW_FILES = [
  {
    key: "constitution",
    file: "Конституция.txt",
    title: "Конституция",
    description: "Базовые права, свободы и основы государственного устройства.",
    questionFile: "КонституцияВопросы.txt"
  },
  {
    key: "criminal",
    file: "УК.txt",
    title: "Уголовный кодекс",
    description: "Преступления, наказания и общие принципы уголовного права.",
    questionFile: "УКВопросы.txt"
  },
  {
    key: "procedure",
    file: "ПроцК.txt",
    title: "Процессуальный кодекс",
    description: "Производство по делам, порядок действий и процессуальные нормы.",
    questionFile: "ПроцКВопросы.txt"
  },
  {
    key: "civil",
    file: "ГраджК.txt",
    title: "Гражданский кодекс",
    description: "Гражданские отношения, права, обязанности и имущество.",
    questionFile: "ГраждКВопросы.txt"
  },
  {
    key: "activity",
    file: "ЗаконОдеятельности.txt",
    title: "Закон о деятельности",
    description: "Нормы профильной деятельности и служебные ограничения.",
    questionFile: "ЗаконОдеятельностиВопросы.txt"
  },
  {
    key: "internal",
    file: "ВнутУстав.txt",
    title: "Внутренний устав",
    description: "Внутренняя организация, правила службы и дисциплина.",
    questionFile: "ВнутУставВопросы.txt"
  },
  {
    key: "discipline",
    file: "ДисципУстав.txt",
    title: "Дисциплинарный устав",
    description: "Ответственность, взыскания и порядок дисциплинарных мер.",
    questionFile: "ДисципУставВопросы.txt"
  },
  {
    key: "guard",
    file: "УставКараульнойСлужбы.txt",
    title: "Устав караульной службы",
    description: "Правила караула, постов и охраны объектов.",
    questionFile: "УставКараульнойСлужбыВопросы.txt"
  }
];

const TEST_QUESTION_COUNT = 10;
const EXAM_TICKETS = 3;
const EXAM_QUESTION_COUNT = TEST_QUESTION_COUNT * EXAM_TICKETS;
const EXAM_TIME_LIMIT_MS = 15 * 60 * 1000;
const EXAM_MAX_MISTAKES = 3;

const state = {
  documents: [],
  activeDocumentIndex: -1,
  query: "",
  assessment: null
};

const docList = document.getElementById("docList");
const readerMeta = document.getElementById("readerMeta");
const readerText = document.getElementById("readerText");
const libraryStatus = document.getElementById("libraryStatus");
const searchInput = document.getElementById("searchInput");
const quizApp = document.getElementById("quiz-app");

async function loadDocuments() {
  const results = await Promise.all(
    LAW_FILES.map(async (item) => {
      try {
        const [documentResponse, manualQuestionResponse] = await Promise.all([
          fetch(encodeURI(item.file)),
          item.questionFile ? fetch(encodeURI(item.questionFile)).catch(() => null) : Promise.resolve(null)
        ]);

        if (!documentResponse.ok) {
          throw new Error(`HTTP ${documentResponse.status}`);
        }

        const text = (await documentResponse.text()).trim();
        const normalizedText = text || "Файл пустой.";
        const articles = parseArticles(normalizedText);
        const manualQuestions =
          manualQuestionResponse && manualQuestionResponse.ok
            ? parseManualQuestions((await manualQuestionResponse.text()).trim(), item)
            : [];

        return {
          ...item,
          text: normalizedText,
          articles,
          questions: manualQuestions,
          questionSource: manualQuestions.length ? "manual" : "missing",
          loaded: true
        };
      } catch (error) {
        return {
          ...item,
          text:
            "Не удалось загрузить файл автоматически. Если сайт открыт как обычный файл через file://, браузер может блокировать чтение .txt. При запуске через локальный сервер или после публикации всё будет работать.",
          articles: [],
          questions: [],
          questionSource: "missing",
          loaded: false,
          error: String(error)
        };
      }
    })
  );

  state.documents = results;
  state.activeDocumentIndex = results.length ? 0 : -1;
  renderAssessment();
  renderLibrary();
}

function parseArticles(text) {
  const cleanedText = text.replace(/\u200b/g, "");
  const rawLines = cleanedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const articles = [];
  let current = null;

  for (const line of rawLines) {
    const articleMatch = line.match(/^Статья\s+([\d.]+)\.?\s*(.*)$/i);
    if (articleMatch) {
      if (current) {
        articles.push(finalizeArticle(current));
      }

      current = {
        number: articleMatch[1],
        explicitTitle: articleMatch[2].trim(),
        lines: []
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    articles.push(finalizeArticle(current));
  }

  return articles.filter((article) => article.preview);
}

function finalizeArticle(article) {
  const joinedContent = article.lines.join(" ").replace(/\s+/g, " ").trim();
  const preview = shortenText(joinedContent, 150);
  const title = article.explicitTitle || shortenText(joinedContent, 90);

  return {
    number: article.number,
    title,
    preview
  };
}

function parseManualQuestions(text, document) {
  const cleanedText = text.replace(/\u200b/g, "").replace(/\r/g, "");
  const blocks = cleanedText
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const questions = [];
  let currentSection = "";

  for (const block of blocks) {
    if (/^РАЗДЕЛ\s+/i.test(block)) {
      currentSection = block.trim();
      continue;
    }

    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 3) {
      continue;
    }

    const firstLine = lines[0];
    const secondLine = lines[1] || "";
    const answerLine = lines.find((line) => /^Ответ:\s*[A-DА-Я]/i.test(line));
    if (!answerLine) {
      continue;
    }

    const optionLines = lines.filter((line) => /^[A-D]\)/.test(line));
    if (optionLines.length < 2) {
      continue;
    }

    const inlineQuestionMatch = firstLine.match(/^([\d.]+)\s+(.*)$/);
    const numberedLineMatch = firstLine.match(/^[\d.]+$/);
    const prefixedQuestionMatch = secondLine.match(/^Вопрос:\s*(.*)$/i);

    const questionNumber = inlineQuestionMatch
      ? inlineQuestionMatch[1]
      : numberedLineMatch
        ? firstLine
        : `${questions.length + 1}`;

    const questionText = inlineQuestionMatch
      ? inlineQuestionMatch[2].trim()
      : prefixedQuestionMatch
        ? prefixedQuestionMatch[1].trim()
        : firstLine.replace(/^Вопрос:\s*/i, "").trim();

    const options = optionLines.map((line) => line.replace(/^[A-D]\)\s*/, "").trim());
    const answerLetter = answerLine.replace(/^Ответ:\s*/i, "").trim().charAt(0).toUpperCase();
    const correctIndex = "ABCD".indexOf(answerLetter);

    if (correctIndex < 0 || correctIndex >= options.length) {
      continue;
    }

    const shuffledQuestion = shuffleQuestionOptions(options, correctIndex);

    questions.push({
      id: `${document.key}-manual-${questionNumber}`,
      prompt: currentSection
        ? `${currentSection}. ${questionNumber} ${questionText}`
        : `${questionNumber} ${questionText}`,
      reference: currentSection
        ? `${currentSection} • статья ${questionNumber}`
        : `Статья ${questionNumber}`,
      ...shuffledQuestion
    });
  }

  return shuffle(questions);
}

function startAssessment(topicKey, mode) {
  const topic = state.documents.find((doc) => doc.key === topicKey);
  if (!topic || !topic.questions.length) {
    return;
  }

  if (mode === "exam") {
    state.assessment = {
      status: "intake",
      mode,
      topicKey,
      topicTitle: topic.title
    };
    renderAssessment();
    return;
  }

  launchAssessment(topic, mode, null);
}

function launchAssessment(topic, mode, identity) {
  clearAssessmentTimer();

  const questionCount = mode === "exam" ? EXAM_QUESTION_COUNT : TEST_QUESTION_COUNT;
  const questions = createQuestionSet(topic.questions, questionCount);

  state.assessment = {
    status: "active",
    mode,
    topicKey: topic.key,
    topicTitle: topic.title,
    questionCount,
    ticketCount: mode === "exam" ? EXAM_TICKETS : 1,
    questions,
    answers: new Array(questionCount).fill(null),
    currentIndex: 0,
    identity,
    startedAt: Date.now(),
    endsAt: mode === "exam" ? Date.now() + EXAM_TIME_LIMIT_MS : null,
    expired: false,
    completed: false
  };

  if (mode === "exam") {
    state.assessment.timerId = window.setInterval(() => {
      if (!state.assessment || state.assessment.completed) {
        clearAssessmentTimer();
        return;
      }

      if (getTimeLeftMs() <= 0) {
        finishAssessment(true);
        return;
      }

      renderAssessment();
    }, 1000);
  }

  renderAssessment();
}

function createQuestionSet(pool, count) {
  if (!pool.length) {
    return [];
  }

  const questions = [];
  let cycle = 0;

  while (questions.length < count) {
    const batch = shuffle(
      pool.map((question) => ({
        ...question,
        instanceId: `${question.id}-${cycle}`
      }))
    );
    questions.push(...batch.slice(0, count - questions.length));
    cycle += 1;
  }

  return questions;
}

function getFilteredDocuments() {
  const query = state.query.trim().toLowerCase();
  if (!query) {
    return state.documents;
  }

  return state.documents.filter((doc) => {
    const haystack = `${doc.title}\n${doc.description}\n${doc.text}`.toLowerCase();
    return haystack.includes(query);
  });
}

function formatDocMeta(doc) {
  const symbolCount = doc.text.length.toLocaleString("ru-RU");
  const articleCount = doc.articles.length.toLocaleString("ru-RU");
  return `${doc.title} • ${symbolCount} символов • ${articleCount} статей`;
}

function renderLibrary() {
  const filtered = getFilteredDocuments();

  libraryStatus.textContent = `Документов: ${filtered.length} из ${state.documents.length}`;

  if (!filtered.length) {
    docList.innerHTML = '<div class="empty-state">Ничего не найдено. Попробуй другой запрос.</div>';
    readerMeta.textContent = "Нет совпадений";
    readerText.textContent = "По текущему запросу документы не найдены.";
    return;
  }

  if (!filtered.includes(state.documents[state.activeDocumentIndex])) {
    const firstMatch = filtered[0];
    state.activeDocumentIndex = state.documents.findIndex((doc) => doc.file === firstMatch.file);
  }

  docList.innerHTML = filtered
    .map((doc) => {
      const originalIndex = state.documents.findIndex((item) => item.file === doc.file);
      const isActive = originalIndex === state.activeDocumentIndex;
      return `
        <button class="doc-card ${isActive ? "is-active" : ""}" data-doc-index="${originalIndex}">
          <div class="doc-card__title">${escapeHtml(doc.title)}</div>
          <div class="doc-card__meta">${escapeHtml(doc.description)}</div>
          <div class="doc-card__meta">${escapeHtml(formatDocMeta(doc))}</div>
        </button>
      `;
    })
    .join("");

  const activeDoc = state.documents[state.activeDocumentIndex];
  if (activeDoc) {
    readerMeta.textContent = `${activeDoc.title} • ${activeDoc.description}`;
    readerText.textContent = activeDoc.text;
  }

  docList.querySelectorAll("[data-doc-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeDocumentIndex = Number(button.dataset.docIndex);
      renderLibrary();
    });
  });
}

function renderAssessment() {
  const assessment = state.assessment;

  if (!assessment) {
    renderAssessmentHub();
    return;
  }

  if (assessment.status === "intake") {
    renderExamIntake();
    return;
  }

  if (assessment.completed) {
    renderAssessmentResult();
    return;
  }

  const currentQuestion = assessment.questions[assessment.currentIndex];
  const selectedAnswer = assessment.answers[assessment.currentIndex];
  const ticketNumber = Math.floor(assessment.currentIndex / TEST_QUESTION_COUNT) + 1;
  const questionInTicket = (assessment.currentIndex % TEST_QUESTION_COUNT) + 1;
  const timeLeft = assessment.mode === "exam" ? formatTime(getTimeLeftMs()) : "Без лимита";

  quizApp.innerHTML = `
    <section class="quiz-card">
      <div class="assessment-head">
        <div>
          <div class="assessment-mode-row">
            <span class="pill">${escapeHtml(getModeLabel(assessment.mode))}</span>
            <span class="pill">${escapeHtml(assessment.topicTitle)}</span>
            <span class="pill">${escapeHtml(`Билет ${ticketNumber} / ${assessment.ticketCount}`)}</span>
          </div>
          <div class="quiz-card__title">Вопрос ${assessment.currentIndex + 1} из ${assessment.questionCount}</div>
          <div class="quiz-card__body">
            ${escapeHtml(`В билете: ${questionInTicket} / ${TEST_QUESTION_COUNT}`)}
          </div>
        </div>
        <div class="timer-card ${assessment.mode === "exam" ? "timer-card--active" : ""}">
          <div class="timer-card__label">${assessment.mode === "exam" ? "Осталось времени" : "Режим"}</div>
          <div class="timer-card__value">${escapeHtml(timeLeft)}</div>
        </div>
      </div>

      <div class="question-box">
        <div class="quiz-card__body">${escapeHtml(currentQuestion.prompt)}</div>
        <div class="answer-list">
          ${currentQuestion.options
            .map((option, index) => {
              const isSelected = selectedAnswer === index;
              return `
                <button class="answer-option ${isSelected ? "is-selected" : ""}" data-answer-index="${index}">
                  ${escapeHtml(option)}
                </button>
              `;
            })
            .join("")}
        </div>
      </div>

      <div class="quiz-actions">
        <button class="button button--ghost" id="backToHub">К темам</button>
        <button class="button button--ghost" id="prevQuestion" ${assessment.currentIndex === 0 ? "disabled" : ""}>Назад</button>
        <button class="button button--primary" id="nextQuestion" ${selectedAnswer === null ? "disabled" : ""}>
          ${assessment.currentIndex === assessment.questionCount - 1 ? "Завершить" : "Далее"}
        </button>
      </div>

      <div class="quiz-note">
        ${assessment.mode === "exam"
          ? "Экзамен состоит из 3 билетов по 10 вопросов. После истечения 15 минут попытка завершится автоматически."
          : "Тест по теме — это один билет из 10 вопросов без ограничения по времени."}
      </div>
    </section>
  `;

  quizApp.querySelectorAll("[data-answer-index]").forEach((button) => {
    button.addEventListener("click", () => {
      assessment.answers[assessment.currentIndex] = Number(button.dataset.answerIndex);
      renderAssessment();
    });
  });

  document.getElementById("backToHub")?.addEventListener("click", () => {
    clearAssessmentTimer();
    state.assessment = null;
    renderAssessment();
  });

  document.getElementById("prevQuestion")?.addEventListener("click", () => {
    assessment.currentIndex = Math.max(0, assessment.currentIndex - 1);
    renderAssessment();
  });

  document.getElementById("nextQuestion")?.addEventListener("click", () => {
    if (assessment.answers[assessment.currentIndex] === null) {
      return;
    }

    if (assessment.currentIndex === assessment.questionCount - 1) {
      finishAssessment(false);
      return;
    }

    assessment.currentIndex += 1;
    renderAssessment();
  });
}

function renderAssessmentHub() {
  quizApp.innerHTML = `
    <section class="mode-panel">
      <div class="mode-grid">
        <article class="mode-card">
          <div class="mode-card__title">Тест</div>
          <div class="mode-card__body">Отдельный билет по выбранной теме. В каждом тесте 10 вопросов.</div>
        </article>
        <article class="mode-card">
          <div class="mode-card__title">Экзамен</div>
          <div class="mode-card__body">3 билета по 10 вопросов. На весь экзамен даётся 15 минут.</div>
        </article>
      </div>

      <div class="topic-grid">
        ${state.documents
          .map((doc) => {
            const ready = doc.questions.length > 0;
            return `
              <article class="topic-card">
                <div class="topic-card__title">${escapeHtml(doc.title)}</div>
                <div class="topic-card__body">${escapeHtml(doc.description)}</div>
                <div class="topic-card__meta">
                  ${escapeHtml(`${doc.articles.length} статей • ${doc.questions.length} вопросов в пуле`)}
                </div>
                <div class="topic-card__meta">
                  ${escapeHtml(doc.questionSource === "manual" ? "Источник вопросов: ручной файл" : "Файл вопросов ещё не добавлен")}
                </div>
                <div class="topic-card__actions">
                  <button class="button button--primary" data-start-mode="test" data-topic-key="${doc.key}" ${ready ? "" : "disabled"}>
                    Билет на 10 вопросов
                  </button>
                  <button class="button button--ghost" data-start-mode="exam" data-topic-key="${doc.key}" ${ready ? "" : "disabled"}>
                    Экзамен 3x10 / 15 мин
                  </button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;

  quizApp.querySelectorAll("[data-start-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      startAssessment(button.dataset.topicKey, button.dataset.startMode);
    });
  });
}

function renderExamIntake() {
  const assessment = state.assessment;

  quizApp.innerHTML = `
    <section class="result-card">
      <div class="assessment-mode-row">
        <span class="pill">Экзамен</span>
        <span class="pill">${escapeHtml(assessment.topicTitle)}</span>
      </div>
      <div class="result-card__title">Допуск К Экзамену</div>
      <div class="result-card__body">
        Перед началом экзамена укажите данные военнослужащего. Экзамен содержит 30 вопросов, длится 15 минут,
        допустимо не более ${EXAM_MAX_MISTAKES} ошибок.
      </div>
      <form id="examIntakeForm" class="intake-form">
        <label class="field">
          <span class="field__label">Имя</span>
          <input class="field__input" name="firstName" type="text" required maxlength="40" placeholder="Введите имя">
        </label>
        <label class="field">
          <span class="field__label">Фамилия</span>
          <input class="field__input" name="lastName" type="text" required maxlength="40" placeholder="Введите фамилию">
        </label>
        <label class="field">
          <span class="field__label">Статик ID</span>
          <input class="field__input" name="staticId" type="text" required maxlength="20" placeholder="Введите статик ID">
        </label>
        <div class="result-actions">
          <button type="button" class="button button--ghost" id="cancelExamStart">Назад</button>
          <button type="submit" class="button button--primary">Начать экзамен</button>
        </div>
      </form>
    </section>
  `;

  document.getElementById("cancelExamStart")?.addEventListener("click", () => {
    state.assessment = null;
    renderAssessment();
  });

  document.getElementById("examIntakeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const identity = {
      firstName: String(formData.get("firstName") || "").trim(),
      lastName: String(formData.get("lastName") || "").trim(),
      staticId: String(formData.get("staticId") || "").trim()
    };

    if (!identity.firstName || !identity.lastName || !identity.staticId) {
      return;
    }

    const topic = state.documents.find((doc) => doc.key === assessment.topicKey);
    if (!topic) {
      return;
    }

    launchAssessment(topic, "exam", identity);
  });
}

function renderAssessmentResult() {
  const assessment = state.assessment;
  const correctAnswers = assessment.answers.reduce((total, answer, index) => {
    return total + (answer === assessment.questions[index].correctIndex ? 1 : 0);
  }, 0);
  const mistakes = assessment.questionCount - correctAnswers;
  const percent = Math.round((correctAnswers / assessment.questionCount) * 100);
  const examPassed = assessment.mode === "exam" ? mistakes <= EXAM_MAX_MISTAKES && !assessment.expired : true;
  const incorrectAnswers = assessment.questions
    .map((question, index) => {
      const selectedIndex = assessment.answers[index];
      if (selectedIndex === question.correctIndex) {
        return null;
      }

      return {
        question,
        selectedAnswer:
          selectedIndex === null || selectedIndex === undefined ? "Ответ не выбран" : question.options[selectedIndex],
        correctAnswer: question.options[question.correctIndex]
      };
    })
    .filter(Boolean);

  quizApp.innerHTML = `
    <section class="result-card">
      <div class="assessment-mode-row">
        <span class="pill">${escapeHtml(getModeLabel(assessment.mode))}</span>
        <span class="pill">${escapeHtml(assessment.topicTitle)}</span>
      </div>
      <div class="result-card__title">${assessment.expired ? "Время вышло" : "Результат готов"}</div>
      <div class="result-card__body">
        ${assessment.mode === "exam"
          ? examPassed
            ? "Экзамен завершён успешно. Допустимое количество ошибок не превышено."
            : "Экзамен не сдан. Допустимое количество ошибок превышено."
          : "Билет по выбранной теме завершён."}
      </div>
      <div class="result-score">${correctAnswers} / ${assessment.questionCount}</div>
      <div class="result-card__body">${percent}% правильных ответов • Ошибок: ${mistakes}</div>
      ${assessment.mode === "exam"
        ? `
          <div class="protocol-card">
            <div class="protocol-card__title">Экзаменационная ведомость</div>
            <table class="protocol-table">
              <tr><th>Имя</th><td>${escapeHtml(assessment.identity?.firstName || "-")}</td></tr>
              <tr><th>Фамилия</th><td>${escapeHtml(assessment.identity?.lastName || "-")}</td></tr>
              <tr><th>Статик ID</th><td>${escapeHtml(assessment.identity?.staticId || "-")}</td></tr>
              <tr><th>Тема</th><td>${escapeHtml(assessment.topicTitle)}</td></tr>
              <tr><th>Формат</th><td>3 билета по 10 вопросов</td></tr>
              <tr><th>Время</th><td>15 минут</td></tr>
              <tr><th>Правильных ответов</th><td>${correctAnswers}</td></tr>
              <tr><th>Ошибок</th><td>${mistakes}</td></tr>
              <tr><th>Допуск по ошибкам</th><td>Не более ${EXAM_MAX_MISTAKES}</td></tr>
              <tr><th>Итог</th><td>${examPassed ? "Экзамен сдан" : "Экзамен не сдан"}</td></tr>
            </table>
          </div>
        `
        : ""}
      ${incorrectAnswers.length
        ? `
          <div class="protocol-card">
            <div class="protocol-card__title">Разбор Ошибок</div>
            <div class="mistake-list">
              ${incorrectAnswers
                .map(
                  (item, index) => `
                    <article class="mistake-card">
                      <div class="mistake-card__title">Ошибка ${index + 1}</div>
                      <div class="mistake-card__body">${escapeHtml(item.question.prompt)}</div>
                      <div class="mistake-card__meta">Ваш ответ: ${escapeHtml(item.selectedAnswer)}</div>
                      <div class="mistake-card__meta">Правильный ответ: ${escapeHtml(item.correctAnswer)}</div>
                      <div class="mistake-card__meta">Ссылка на статью: ${escapeHtml(item.question.reference || "Не указана")}</div>
                    </article>
                  `
                )
                .join("")}
            </div>
          </div>
        `
        : ""}
      <div class="result-actions">
        <button class="button button--primary" id="restartAssessment">Пройти ещё раз</button>
        <button class="button button--ghost" id="backToTopics">К выбору тем</button>
      </div>
    </section>
  `;

  document.getElementById("restartAssessment")?.addEventListener("click", () => {
    const { topicKey, mode } = assessment;
    startAssessment(topicKey, mode);
  });

  document.getElementById("backToTopics")?.addEventListener("click", () => {
    clearAssessmentTimer();
    state.assessment = null;
    renderAssessment();
  });
}

function finishAssessment(expired) {
  if (!state.assessment) {
    return;
  }

  clearAssessmentTimer();
  state.assessment.expired = expired;
  state.assessment.completed = true;
  renderAssessment();
}

function clearAssessmentTimer() {
  if (state.assessment?.timerId) {
    window.clearInterval(state.assessment.timerId);
    state.assessment.timerId = null;
  }
}

function getTimeLeftMs() {
  if (!state.assessment?.endsAt) {
    return EXAM_TIME_LIMIT_MS;
  }

  return Math.max(0, state.assessment.endsAt - Date.now());
}

function getModeLabel(mode) {
  return mode === "exam" ? "Экзамен" : "Тест";
}

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function shortenText(text, maxLength) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function shuffle(items) {
  const array = [...items];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function shuffleQuestionOptions(options, correctIndex) {
  const mapped = options.map((option, index) => ({
    option,
    isCorrect: index === correctIndex
  }));
  const shuffled = shuffle(mapped);

  return {
    options: shuffled.map((item) => item.option),
    correctIndex: shuffled.findIndex((item) => item.isCorrect)
  };
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderLibrary();
});

renderAssessment();
loadDocuments();
