# Belinda Lab — аналитика визитов МП

React + Vite: дашборд визитов, календарь, аналитика, план/факт, локальный кэш (IndexedDB) и выгрузка всех месяцев с Google Apps Script.

## Быстрый старт

1. Клонируйте репозиторий и установите зависимости:

   ```bash
   git clone https://github.com/Farruhk12/belinda-lab-mp-visit-analytics.git
   cd belinda-lab-mp-visit-analytics
   npm install
   ```

2. Создайте файл `.env` из примера и заполните переменные:

   ```bash
   copy .env.example .env
   ```

   На macOS/Linux: `cp .env.example .env`

   - `VITE_API_URL` — URL развёрнутого веб-приложения Apps Script (см. `apps-script/Code.gs`).
   - `VITE_ADMIN_USERNAME` / `VITE_ADMIN_PASSWORD` — опциональный локальный вход администратора (данные попадают в клиентский бандл; для продакшена лучше отключить или вынести авторизацию на сервер).

3. Запуск в режиме разработки:

   ```bash
   npm run dev
   ```

   Откройте в браузере адрес из консоли (по умолчанию порт `3000`).

4. Сборка:

   ```bash
   npm run build
   npm run preview
   ```

## Локальный кэш

В разделе **«Локальный кэш»** можно сохранить данные за выбранный месяц, за **текущий год с января по текущий месяц** (по умолчанию) или за **весь период** по датам в таблице (отдельная кнопка, может быть долго). Выгрузка идёт параллельно (несколько месяцев одновременно).

## Google Apps Script

Логика бэкенда таблицы — в файле `apps-script/Code.gs`. Скопируйте его в редактор скриптов, привязанный к нужной Google Таблице, и выполните развёртывание как **Веб-приложение**.

## Деплой на GitHub Pages

Сайт собирается workflow’ом [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml) при push в `master` или `main`.

1. В репозитории: **Settings → Secrets and variables → Actions** добавьте секреты:
   - `VITE_API_URL` — URL веб-приложения Apps Script  
   - `VITE_ADMIN_USERNAME` / `VITE_ADMIN_PASSWORD` — как в локальном `.env` (попадут в клиентский бандл).

2. **Settings → Pages** → **Build and deployment** → Source: **GitHub Actions**.

3. После успешного workflow приложение будет по адресу:  
   `https://farruhk12.github.io/belinda-lab-mp-visit-analytics/`  
   (если репозиторий переименован — поправьте `VITE_BASE_PATH` в workflow и при необходимости имя в URL).

Локальная проверка сборки «как на Pages»:

```bash
set VITE_BASE_PATH=/belinda-lab-mp-visit-analytics/
npm run build
npx vite preview
```

## Публикация кода на GitHub

Репозиторий: [github.com/Farruhk12/belinda-lab-mp-visit-analytics](https://github.com/Farruhk12/belinda-lab-mp-visit-analytics)

```bash
git add -A
git commit -m "Ваше сообщение"
git push origin master
```

Секреты не храните в коде — только в `.env` локально и в **GitHub Actions secrets** для деплоя.

## Лицензия

Внутренний проект Belinda Lab.
