// ============================================================
//  Belinda Lab — Google Apps Script
//  Обновляйте только этот файл, не трогая остальной код проекта
// ============================================================

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Параметр month (формат: "YYYY-MM") — фильтрует данные по месяцу
  // Если указан: отдаёт визиты/фиксацию/заказы только за этот месяц
  //              + вычисляет oldDoctorKeys (врачи, посещённые ДО этого месяца)
  const monthParam = (e && e.parameter && e.parameter.month) ? e.parameter.month : null;

  // 1. Визиты (актуальный лист)
  const visitsSheet = ss.getSheetByName("Взт 26");
  const allVisits = visitsSheet ? getSheetData(visitsSheet) : [];

  // Если указан месяц — разделяем визиты и вычисляем oldDoctorKeys на сервере
  let visitsJson = allVisits;
  let oldDoctorKeys = [];

  if (monthParam && allVisits.length > 0) {
    const before = [];
    const current = [];

    allVisits.forEach(v => {
      const dateKey = Object.keys(v).find(k => k.toLowerCase().includes('дата'));
      if (!dateKey) { current.push(v); return; }
      const dateVal = String(v[dateKey] || "");
      if (!dateVal) return;
      const ym = dateVal.substring(0, 7);
      if (ym < monthParam) {
        before.push(v);
      } else if (ym === monthParam) {
        current.push(v);
      }
      // Визиты после monthParam — не нужны
    });

    // Формируем Set ключей "врач|ЛПУ" для всех визитов ДО выбранного месяца
    const oldSet = {};
    before.forEach(v => {
      const doc = v["Имя доктора"] || v["Врач"] || "";
      const lpu = v["Аб ЛПУ"] || "";
      if (doc) oldSet[doc + "|" + lpu] = true;
    });
    oldDoctorKeys = Object.keys(oldSet);

    // Ключи с привязкой к МП: "rep:ИмяМП|ИмяВрача" — клиент фильтрует по своему МП
    const oldByRepSet = {};
    before.forEach(v => {
      const doc = v["Имя доктора"] || v["Врач"] || "";
      const rep = v["Мед представитель"] || v["Медицинский представитель"] || "";
      if (doc && doc !== "—" && rep) oldByRepSet[rep + "|" + doc] = true;
    });
    Object.keys(oldByRepSet).forEach(key => {
      oldDoctorKeys.push("rep:" + key);
    });

    visitsJson = current;
  }

  // 2. Сотрудники
  const employeesSheet = ss.getSheetByName("Сотрудники");
  const employeesJson  = employeesSheet ? getSheetData(employeesSheet) : [];

  const activeEmployees = employeesJson.filter(emp => {
    const statusKey = Object.keys(emp).find(k => k.toLowerCase().trim() === "статус");
    const roleKey   = Object.keys(emp).find(k => k.toLowerCase().trim() === "роль");
    const status    = statusKey ? String(emp[statusKey]).toLowerCase().trim() : "";
    const role      = roleKey   ? String(emp[roleKey]).trim() : "";
    return status === "активный" && (role === "МП" || role === "мед представитель");
  });

  // 3. Фиксация — фильтруем по месяцу если указан
  const fixationSheet = ss.getSheetByName("Фиксация");
  let fixationJson = fixationSheet ? getSheetData(fixationSheet) : [];

  if (monthParam && fixationJson.length > 0) {
    fixationJson = filterByMonth(fixationJson, monthParam);
  }

  // 4. Заказы покупателей — фильтруем по месяцу если указан
  const ordersSheet = ss.getSheetByName("Заказы покупателей");
  let ordersJson = ordersSheet ? getSheetData(ordersSheet) : [];

  if (monthParam && ordersJson.length > 0) {
    ordersJson = filterByMonth(ordersJson, monthParam);
  }

  // 5. Пользователи системы (Менеджера)
  const managersSheet = ss.getSheetByName("Менеджера");
  let managersJson    = [];

  if (managersSheet) {
    const data = managersSheet.getDataRange().getValues();
    if (data.length > 1) {
      const headers = data.shift();
      const colMap  = getColumnMap(headers);

      managersJson = data.map(row => {
        let perms = { territories: ['*'], groups: ['*'] };
        try {
          const pVal = row[colMap['permissions']];
          if (pVal && String(pVal).trim() !== "") perms = JSON.parse(pVal);
        } catch (e) {}

        return {
          id:          String(row[colMap['id']]       || ""),
          username:    row[colMap['username']],
          password:    String(row[colMap['password']] || ""),
          role:        row[colMap['role']],
          permissions: perms,
          fullName:    row[colMap['fullname']],
          mpName:      colMap['mpname'] !== undefined ? String(row[colMap['mpname']] || "") : ""
        };
      }).filter(u => u.username);
    }
  }

  const result = {
    visits:       visitsJson,
    employees:    activeEmployees,
    allEmployees: employeesJson,
    fixation:     fixationJson,
    orders:       ordersJson,
    managers:     managersJson
  };

  // Добавляем oldDoctorKeys только если был запрошен месяц
  if (monthParam) {
    result.oldDoctorKeys = oldDoctorKeys;
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  doPost — CRUD пользователей системы
// ============================================================

function doPost(e) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Менеджера");

  if (!sheet) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'Лист "Менеджера" не найден' })
    );
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'Server is busy' })
    );
  }

  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action;
    const user    = payload.user;
    const userId  = payload.id;

    const data    = sheet.getDataRange().getValues();
    const headers = data.length > 0 ? data[0] : [];
    const colMap  = getColumnMap(headers);

    const createRowFromUser = (u) => {
      const row = new Array(headers.length).fill("");
      if (colMap['id']          !== undefined) row[colMap['id']]          = "'" + u.id;
      if (colMap['username']    !== undefined) row[colMap['username']]    = u.username;
      if (colMap['password']    !== undefined) row[colMap['password']]    = u.password;
      if (colMap['role']        !== undefined) row[colMap['role']]        = u.role;
      if (colMap['permissions'] !== undefined) row[colMap['permissions']] = JSON.stringify(u.permissions);
      if (colMap['fullname']    !== undefined) row[colMap['fullname']]    = u.fullName || "";
      if (colMap['mpname']      !== undefined) row[colMap['mpname']]      = u.mpName   || "";
      return row;
    };

    if (action === 'create') {
      sheet.appendRow(createRowFromUser(user));

    } else if (action === 'update') {
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][colMap['id']]) === String(user.id)) {
          const newRow = createRowFromUser(user);
          sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
          found = true;
          break;
        }
      }
      if (!found) sheet.appendRow(createRowFromUser(user));

    } else if (action === 'delete') {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][colMap['id']]) === String(userId)) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
//  Вспомогательные функции
// ============================================================

/**
 * Строит карту { ключ → индекс_колонки } по заголовкам листа.
 * Понимает русские и английские варианты названий.
 */
function getColumnMap(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const label = h.toString().toLowerCase().trim();

    if (['id', 'ид', 'код'].includes(label))
      map['id'] = i;

    if (['username', 'login', 'логин', 'имя пользователя', 'пользователь'].includes(label))
      map['username'] = i;

    if (['password', 'pass', 'пароль'].includes(label))
      map['password'] = i;

    if (['role', 'роль'].includes(label))
      map['role'] = i;

    if (['permissions', 'perm', 'права', 'доступ', 'разрешения'].includes(label))
      map['permissions'] = i;

    if (['fullname', 'full name', 'фио', 'полное имя', 'имя'].includes(label))
      map['fullname'] = i;

    // Имя МП для личного кабинета (роль 'mp')
    if (['mpname', 'mp name', 'имя мп', 'мп', 'медпредставитель'].includes(label))
      map['mpname'] = i;
  });
  return map;
}

/**
 * Читает весь лист и возвращает массив объектов { заголовок: значение }.
 * Даты автоматически форматируются в "yyyy-MM-dd".
 */
function getSheetData(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data.shift();

  return data.map(row => {
    let obj = {};
    headers.forEach((header, i) => {
      let value = row[i];
      if (header.toString().toLowerCase().includes('дата') && value instanceof Date) {
        obj[header] = Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        obj[header] = value;
      }
    });
    return obj;
  });
}

/**
 * Фильтрует массив объектов по месяцу.
 * Ищет первое поле с "дата" в названии и сравнивает с monthStr (формат "YYYY-MM").
 */
function filterByMonth(rows, monthStr) {
  if (!monthStr || !rows.length) return rows;

  return rows.filter(row => {
    const dateKey = Object.keys(row).find(k => k.toLowerCase().includes('дата'));
    if (!dateKey) return true;

    const dateVal = String(row[dateKey] || "");
    if (!dateVal) return false;

    return dateVal.substring(0, 7) === monthStr;
  });
}
