const LAW_FILES = [
  {
    key: "constitution",
    file: "content/laws/Конституция.txt",
    title: "Конституция",
    description: "Базовые права, свободы и основы государственного устройства.",
    questionFile: "content/questions/КонституцияВопросы.txt"
  },
  {
    key: "criminal",
    file: "content/laws/УК.txt",
    title: "Уголовный кодекс",
    description: "Преступления, наказания и общие принципы уголовного права.",
    questionFile: "content/questions/УКВопросы.txt"
  },
  {
    key: "procedure",
    file: "content/laws/ПроцК.txt",
    title: "Процессуальный кодекс",
    description: "Производство по делам, порядок действий и процессуальные нормы.",
    questionFile: "content/questions/ПроцКВопросы.txt"
  },
  {
    key: "civil",
    file: "content/laws/ГраджК.txt",
    title: "Гражданский кодекс",
    description: "Гражданские отношения, права, обязанности и имущество.",
    questionFile: "content/questions/ГраждКВопросы.txt"
  },
  {
    key: "activity",
    file: "content/laws/ЗаконОдеятельности.txt",
    title: "Закон о деятельности",
    description: "Нормы профильной деятельности и служебные ограничения.",
    questionFile: "content/questions/ЗаконОдеятельностиВопросы.txt"
  },
  {
    key: "internal",
    file: "content/laws/ВнутУстав.txt",
    title: "Внутренний устав",
    description: "Внутренняя организация, правила службы и дисциплина.",
    questionFile: "content/questions/ВнутУставВопросы.txt"
  },
  {
    key: "discipline",
    file: "content/laws/ДисципУстав.txt",
    title: "Дисциплинарный устав",
    description: "Ответственность, взыскания и порядок дисциплинарных мер.",
    questionFile: "content/questions/ДисципУставВопросы.txt"
  },
  {
    key: "guard",
    file: "content/laws/УставКараульнойСлужбы.txt",
    title: "Устав караульной службы",
    description: "Правила караула, постов и охраны объектов.",
    questionFile: "content/questions/УставКараульнойСлужбыВопросы.txt"
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
    const structuralHeadingMatch = /^(Раздел|Глава)\s+[IVXLCDM\d]+[.\s-]/i.test(line);
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

    if (structuralHeadingMatch) {
      if (current) {
        articles.push(finalizeArticle(current));
        current = null;
      }
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
    preview,
    content: joinedContent
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
  if (!topic) {
    return;
  }

  if (mode === "training") {
    state.assessment = {
      status: "training",
      mode,
      topicKey,
      topicTitle: topic.title,
      articleIndex: 0
    };
    renderAssessment();
    return;
  }

  if (!topic.questions.length) {
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

  return state.documents
    .map((doc) => {
      const haystack = `${doc.title}\n${doc.description}\n${doc.text}`.toLowerCase();
      const matchIndex = haystack.indexOf(query);
      return matchIndex >= 0
        ? {
            ...doc,
            matchIndex,
            matchExcerpt: createMatchExcerpt(doc.text, query)
          }
        : null;
    })
    .filter(Boolean);
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

  if (!filtered.some((doc) => doc.file === state.documents[state.activeDocumentIndex]?.file)) {
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
          ${
            doc.matchExcerpt
              ? `<div class="doc-card__match">${highlightMatch(doc.matchExcerpt, state.query)}</div>`
              : ""
          }
        </button>
      `;
    })
    .join("");

  const activeDoc = state.documents[state.activeDocumentIndex];
  if (activeDoc) {
    readerMeta.textContent = `${activeDoc.title} • ${activeDoc.description}`;
    const formattedText = formatLegalText(activeDoc.text);
    readerText.innerHTML = state.query.trim()
      ? highlightMatch(formattedText, state.query)
      : escapeHtml(formattedText);

    if (state.query.trim()) {
      requestAnimationFrame(() => {
        const firstHit = readerText.querySelector(".search-hit");
        if (firstHit) {
          firstHit.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      });
    } else {
      readerText.scrollTop = 0;
    }
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

  if (assessment.status === "training") {
    renderTraining();
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
  const progressPercent = Math.max(4, Math.round(((assessment.currentIndex + 1) / assessment.questionCount) * 100));

  quizApp.innerHTML = `
    <section class="quiz-card quiz-card--assessment">
      <div class="assessment-head">
        <div class="assessment-head__main">
          <div class="assessment-mode-row">
            <span class="pill">${escapeHtml(getModeLabel(assessment.mode))}</span>
            <span class="pill">${escapeHtml(assessment.topicTitle)}</span>
            <span class="pill">${escapeHtml(`Билет ${ticketNumber} / ${assessment.ticketCount}`)}</span>
          </div>
          <div class="quiz-card__title">Вопрос ${assessment.currentIndex + 1} из ${assessment.questionCount}</div>
          <div class="quiz-card__body">
            ${escapeHtml(`В билете: ${questionInTicket} / ${TEST_QUESTION_COUNT}`)}
          </div>
          <div class="assessment-progress" aria-hidden="true">
            <div class="assessment-progress__bar" style="width:${progressPercent}%"></div>
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
                  <span class="answer-option__key">${String.fromCharCode(65 + index)}</span>
                  <span class="answer-option__text">${escapeHtml(option)}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>

      <div class="quiz-actions quiz-actions--assessment">
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
    <section class="mode-panel mode-panel--hub">
      <div class="mode-grid mode-grid--triple">
        <article class="mode-card">
          <div class="mode-card__title">Тест</div>
          <div class="mode-card__body">Отдельный билет по выбранной теме. В каждом тесте 10 вопросов.</div>
        </article>
        <article class="mode-card">
          <div class="mode-card__title">Экзамен</div>
          <div class="mode-card__body">3 билета по 10 вопросов. На весь экзамен даётся 15 минут.</div>
        </article>
        <article class="mode-card">
          <div class="mode-card__title">Обучение</div>
          <div class="mode-card__body">Читайте статьи и изучайте материал по теме до запуска билета или экзамена.</div>
        </article>
      </div>

      <div class="topic-grid">
        ${state.documents
          .map((doc) => {
            const ready = doc.questions.length > 0;
            return `
              <article class="topic-card ${ready ? "topic-card--ready" : "topic-card--pending"}">
                <div class="topic-card__title">${escapeHtml(doc.title)}</div>
                <div class="topic-card__body">${escapeHtml(doc.description)}</div>
                <div class="topic-card__meta">
                  ${escapeHtml(`${doc.articles.length} статей • ${doc.questions.length} вопросов в пуле`)}
                </div>
                <div class="topic-card__status">
                  ${escapeHtml(doc.questionSource === "manual" ? "Готово к сдаче" : "Ожидает файл вопросов")}
                </div>
                <div class="topic-card__meta">
                  ${escapeHtml(doc.questionSource === "manual" ? "Источник вопросов: ручной файл" : "Файл вопросов ещё не добавлен")}
                </div>
                <div class="topic-card__actions">
                  <button class="button button--ghost" data-start-mode="training" data-topic-key="${doc.key}">
                    Обучение
                  </button>
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

function renderTraining() {
  const assessment = state.assessment;
  const topic = state.documents.find((doc) => doc.key === assessment.topicKey);
  if (!topic) {
    state.assessment = null;
    renderAssessment();
    return;
  }

  const hasArticles = topic.articles.length > 0;
  const safeIndex = Math.min(assessment.articleIndex || 0, Math.max(topic.articles.length - 1, 0));
  assessment.articleIndex = safeIndex;
  const navScrollTop = assessment.navScrollTop || 0;
  const visibleArticles = hasArticles ? topic.articles.slice(safeIndex) : [];

  quizApp.innerHTML = `
    <section class="result-card training-card">
      <div class="assessment-mode-row">
        <span class="pill">Обучение</span>
        <span class="pill">${escapeHtml(topic.title)}</span>
        <span class="pill">${escapeHtml(hasArticles ? `Статей: ${topic.articles.length}` : "Полный документ")}</span>
      </div>
      <div class="result-card__title">Обучение По Теме</div>
      <div class="result-card__body">${escapeHtml(topic.description)}</div>

      <div class="training-layout">
        <aside class="training-nav">
          <div class="training-nav__title">${escapeHtml(hasArticles ? "Навигация по статьям" : "Материал темы")}</div>
          ${
            hasArticles
              ? topic.articles
                  .map(
                    (article, index) => `
                      <button class="training-item ${index === safeIndex ? "is-active" : ""}" data-article-index="${index}">
                        <span class="training-item__title">${escapeHtml(`Статья ${article.number}`)}</span>
                        <span class="training-item__text">${escapeHtml(article.title || article.preview)}</span>
                      </button>
                    `
                  )
                  .join("")
              : `
                <div class="training-item training-item--static">
                  <span class="training-item__title">${escapeHtml(topic.title)}</span>
                  <span class="training-item__text">${escapeHtml(topic.description)}</span>
                </div>
              `
          }
        </aside>

        <article class="training-article">
          ${
            hasArticles
              ? visibleArticles
                  .map(
                    (article, index) => `
                      <section class="training-article-block ${index === 0 ? "is-primary" : ""}">
                        <div class="training-article__header">
                          <div class="training-article__title">${escapeHtml(`Статья ${article.number}`)}</div>
                          <div class="training-article__meta">${escapeHtml(article.title || "Текст статьи")}</div>
                        </div>
                        <pre class="training-article__text">${escapeHtml(formatLegalText(article.content || article.preview))}</pre>
                      </section>
                    `
                  )
                  .join("")
              : `
                <section class="training-article-block is-primary">
                  <div class="training-article__header">
                    <div class="training-article__title">${escapeHtml(topic.title)}</div>
                    <div class="training-article__meta">Полный текст документа</div>
                  </div>
                  <pre class="training-article__text">${escapeHtml(formatLegalText(topic.text))}</pre>
                </section>
              `
          }
        </article>
      </div>

      <div class="result-actions">
        <button class="button button--ghost" id="backFromTraining">К темам</button>
        <button class="button button--primary" data-start-mode="test" data-topic-key="${topic.key}" ${topic.questions.length ? "" : "disabled"}>Перейти к тесту</button>
        <button class="button button--ghost" data-start-mode="exam" data-topic-key="${topic.key}" ${topic.questions.length ? "" : "disabled"}>Перейти к экзамену</button>
      </div>
    </section>
  `;

  document.getElementById("backFromTraining")?.addEventListener("click", () => {
    state.assessment = null;
    renderAssessment();
  });

  const navElement = quizApp.querySelector(".training-nav");
  if (navElement) {
    navElement.scrollTop = navScrollTop;
  }

  quizApp.querySelectorAll("[data-article-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentNav = quizApp.querySelector(".training-nav");
      assessment.navScrollTop = currentNav ? currentNav.scrollTop : 0;
      assessment.articleIndex = Number(button.dataset.articleIndex);
      renderTraining();
    });
  });

  quizApp.querySelectorAll('[data-start-mode="test"], [data-start-mode="exam"]').forEach((button) => {
    button.addEventListener("click", () => {
      startAssessment(button.dataset.topicKey, button.dataset.startMode);
    });
  });
}

function renderExamIntake() {
  const assessment = state.assessment;

  quizApp.innerHTML = `
    <section class="result-card result-card--intake">
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
    <section class="result-card result-card--report">
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

function formatLegalText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\u200b/g, "")
    .replace(/ч\.\s*(\d+)(?=[А-ЯA-ZЁ])/g, "ч.$1 ")
    .replace(/(^|\s)(Статья\s+\d+[\d.]*)/g, "\n\n$2")
    .replace(/(^|\s)(ч\.\s*\d+)/g, "\n\n$2")
    .replace(/([.:;])\s*([а-я])\)/gi, "$1\n$2)")
    .replace(/\s+([а-я])\)(?=\s)/gi, "\n$1)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createMatchExcerpt(text, query) {
  const normalized = formatLegalText(text);
  const lowerText = normalized.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex < 0) {
    return "";
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(normalized.length, matchIndex + lowerQuery.length + 120);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < normalized.length ? "…" : "";

  return `${prefix}${normalized.slice(start, end).trim()}${suffix}`;
}

function highlightMatch(text, query) {
  const safeText = escapeHtml(text);
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return safeText;
  }

  const safeQuery = escapeRegex(escapeHtml(trimmedQuery));
  const pattern = new RegExp(`(${safeQuery})`, "gi");
  return safeText.replace(pattern, '<mark class="search-hit">$1</mark>');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
