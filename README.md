# CROSS Family Examination

Это бесплатный статический сайт для теста по законам GTA 5 RP.

## Что уже есть

- Красивая стартовая страница
- Главный визуальный постер CROSS FAMILY на главном экране
- Блок теста
- Просмотрщик законов из `.txt`
- Поиск по документам

## Какие файлы важные

- [index.html](C:\Users\core\Desktop\SANG SITE\index.html) - структура сайта
- [styles.css](C:\Users\core\Desktop\SANG SITE\styles.css) - дизайн
- [app.js](C:\Users\core\Desktop\SANG SITE\app.js) - логика теста и загрузка статей

## Где лежат материалы

- Законы и уставы: `content/laws/`
- Файлы вопросов: `content/questions/`
- Логотипы и постеры: `assets/images/logos/`
- Картинки для кнопок: `assets/images/buttons/`
- Фоны и декоративные изображения: `assets/images/backgrounds/`

Подробная структура описана в [STRUCTURE.md](C:\Users\core\Desktop\SANG SITE\STRUCTURE.md).

## Как запускать

Лучше открывать сайт не просто двойным кликом по `index.html`, а через локальный сервер.
Иначе браузер может не дать читать `.txt` файлы.

Подойдут такие варианты:

1. VS Code + Live Server
2. Python локальный сервер: `python -m http.server`
3. Бесплатный хостинг: GitHub Pages, Netlify, Cloudflare Pages

## Что можно сделать дальше

- Заполнить тест реальными вопросами по статьям
- Добавить случайную выборку вопросов
- Сделать проходной балл
- Добавить таймер экзамена
- Сделать страницу "результат с ошибками"
