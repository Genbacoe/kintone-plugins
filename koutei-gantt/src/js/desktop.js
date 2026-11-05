(function(PLUGIN_ID) {
  'use strict';

  var MAX_RECORDS = 1000;
  var FETCH_LIMIT = 500;
  var DAY_SCALE_LIMIT = 100;
  var PAPERS = {a3: {label: 'A3横', rows: 38}, a4: {label: 'A4横', rows: 24}};
  var MONTHS = [1, 2, 3, 4, 6, 12];
  var DAY = 86400000;
  var config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  if (!config.task || !config.start || !config.end) return;
  var title = config.title || '工程表';

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function text(field) {
    if (!field || field.value === null || field.value === undefined) return '';
    var value = field.value;
    if (Array.isArray(value)) return value.map(function(v) { return (v && typeof v === 'object') ? (v.name || v.code || '') : String(v); }).join('、');
    if (typeof value === 'object') return value.name || value.code || '';
    return String(value).trim();
  }

  // 日付は「2026-11-02」の文字列で届く。時差の影響を受けないよう、UTCの通し日数で扱う
  function serial(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY) : null;
  }

  function parts(n) {
    var d = new Date(n * DAY);
    return {y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay()};
  }

  function short(n) {
    var p = parts(n);
    return p.m + '/' + p.d;
  }

  function today() {
    var now = new Date();
    return serial(now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()));
  }

  function monthStart(n) {
    var p = parts(n);
    return Math.round(Date.UTC(p.y, p.m - 1, 1) / DAY);
  }

  function addMonths(n, count) {
    var p = parts(n);
    return Math.round(Date.UTC(p.y, p.m - 1 + count, 1) / DAY);
  }

  function monthValue(n) {
    var p = parts(n);
    return p.y + '-' + pad(p.m);
  }

  function itemsOf(records) {
    var result = {items: [], noDate: 0, reversed: 0};
    records.forEach(function(record) {
      var start = serial(text(record[config.start]));
      var end = serial(text(record[config.end]));
      if (start === null || end === null) {
        result.noDate++;
        return;
      }
      if (end < start) {
        result.reversed++;
        return;
      }
      var progress = null;
      if (config.progress) {
        var raw = text(record[config.progress]);
        if (raw !== '' && !isNaN(Number(raw))) progress = Math.min(Math.max(Number(raw), 0), 100);
      }
      result.items.push({
        task: text(record[config.task]) || '（作業名なし）',
        project: config.project ? (text(record[config.project]) || '（工事名なし）') : '',
        company: config.company ? text(record[config.company]) : '',
        start: start,
        end: end,
        progress: progress,
        actualStart: config.actualStart ? serial(text(record[config.actualStart])) : null,
        actualEnd: config.actualEnd ? serial(text(record[config.actualEnd])) : null
      });
    });
    return result;
  }

  // 工事名ごとにまとめる。工事の順と、工事の中の順は一覧の並び順のまま
  function rowsOf(items) {
    if (!config.project) return items.map(function(item) { return {type: 'task', item: item}; });
    var order = [];
    var groups = {};
    items.forEach(function(item) {
      if (!groups[item.project]) {
        groups[item.project] = {name: item.project, start: item.start, end: item.end, items: []};
        order.push(item.project);
      }
      var group = groups[item.project];
      group.items.push(item);
      group.start = Math.min(group.start, item.start);
      group.end = Math.max(group.end, item.end);
    });
    var rows = [];
    order.forEach(function(name) {
      rows.push({type: 'group', group: groups[name]});
      groups[name].items.forEach(function(item) {
        rows.push({type: 'task', item: item});
      });
    });
    return rows;
  }

  // 工事名の行がページの最後に1行だけ残らないようにする
  function paginate(rows, perPage) {
    var pages = [];
    var page = [];
    rows.forEach(function(row) {
      var room = perPage - page.length;
      if (room === 0 || (row.type === 'group' && room === 1)) {
        pages.push(page);
        page = [];
      }
      page.push(row);
    });
    if (page.length) pages.push(page);
    return pages;
  }

  function percent(n, view) {
    return (Math.min(Math.max(n - view.from, 0), view.days) / view.days * 100) + '%';
  }

  function span(node, from, to, view) {
    node.style.left = percent(from, view);
    node.style.width = 'calc(' + percent(to + 1, view) + ' - ' + percent(from, view) + ')';
    return node;
  }

  function visible(from, to, view) {
    return to >= view.from && from < view.from + view.days;
  }

  function bar(className, from, to, view) {
    var node = span(element('div', className), from, to, view);
    if (from < view.from) node.classList.add('gbg-cut-left');
    if (to >= view.from + view.days) node.classList.add('gbg-cut-right');
    return node;
  }

  function renderGrid(view) {
    var grid = element('div', 'gbg-grid');
    for (var n = view.from; n < view.from + view.days; n++) {
      var p = parts(n);
      if (view.daily && (p.w === 0 || p.w === 6)) grid.appendChild(span(element('div', p.w === 0 ? 'gbg-sun' : 'gbg-sat'), n, n, view));
      if (n === view.from) continue;
      if (p.d === 1) {
        grid.appendChild(span(element('div', 'gbg-line gbg-month-line'), n, n, view));
      } else if (view.daily || p.w === 1) {
        grid.appendChild(span(element('div', 'gbg-line'), n, n, view));
      }
    }
    if (view.today >= view.from && view.today < view.from + view.days) {
      var line = span(element('div', 'gbg-today'), view.today, view.today, view);
      grid.appendChild(line);
    }
    return grid;
  }

  function renderScale(view) {
    var scale = element('div', 'gbg-scale');
    var months = element('div', 'gbg-months');
    var cursor = view.from;
    while (cursor < view.from + view.days) {
      var next = Math.min(addMonths(cursor, 1), view.from + view.days);
      var p = parts(cursor);
      months.appendChild(span(element('div', 'gbg-month', p.y + '年' + p.m + '月'), cursor, next - 1, view));
      cursor = next;
    }
    scale.appendChild(months);
    var days = element('div', 'gbg-days');
    for (var n = view.from; n < view.from + view.days; n++) {
      var d = parts(n);
      if (view.daily) {
        days.appendChild(span(element('div', 'gbg-day' + (d.w === 0 ? ' gbg-sun-text' : (d.w === 6 ? ' gbg-sat-text' : '')), String(d.d)), n, n, view));
      } else if (d.w === 1) {
        days.appendChild(span(element('div', 'gbg-week', short(n)), n, Math.min(n + 6, view.from + view.days - 1), view));
      }
    }
    scale.appendChild(days);
    return scale;
  }

  function labelCells(row, values, wide) {
    row.appendChild(element('div', 'gbg-c-task', values[0]));
    if (wide) {
      row.appendChild(element('div', 'gbg-c-date', values[3]));
      return;
    }
    if (config.company) row.appendChild(element('div', 'gbg-c-company', values[1]));
    if (config.progress) row.appendChild(element('div', 'gbg-c-progress', values[2]));
    row.appendChild(element('div', 'gbg-c-date', values[3]));
  }

  function renderRow(row, view) {
    var node = element('div', 'gbg-row');
    var label = element('div', 'gbg-label');
    var track = element('div', 'gbg-track');
    node.appendChild(label);
    node.appendChild(track);
    if (row.type === 'group') {
      node.classList.add('gbg-group');
      labelCells(label, [row.group.name, '', '', short(row.group.start) + '〜' + short(row.group.end)], true);
      if (visible(row.group.start, row.group.end, view)) track.appendChild(bar('gbg-summary', row.group.start, row.group.end, view));
      return node;
    }
    var item = row.item;
    labelCells(label, [item.task, item.company, item.progress === null ? '' : Math.round(item.progress) + '%', short(item.start) + '〜' + short(item.end)]);
    if (visible(item.start, item.end, view)) {
      var plan = bar('gbg-plan', item.start, item.end, view);
      if (item.progress !== null) {
        var fill = element('div', 'gbg-fill');
        fill.style.width = item.progress + '%';
        plan.appendChild(fill);
        if (item.progress >= 100) plan.classList.add('gbg-done');
      }
      track.appendChild(plan);
    } else {
      node.classList.add('gbg-outside');
    }
    if (item.actualStart !== null) {
      var actualEnd = item.actualEnd;
      if (actualEnd === null) actualEnd = Math.max(view.today, item.actualStart);
      if (actualEnd >= item.actualStart && visible(item.actualStart, actualEnd, view)) {
        track.appendChild(bar('gbg-actual' + (item.actualEnd === null ? ' gbg-ongoing' : ''), item.actualStart, actualEnd, view));
      }
    }
    return node;
  }

  function renderPage(rows, view, paper, index, total) {
    var sheet = element('section', 'gbg-sheet gbg-' + paper);
    var head = element('div', 'gbg-head');
    head.appendChild(element('h1', 'gbg-title', title));
    var last = parts(view.from + view.days - 1);
    var first = parts(view.from);
    var period = first.y + '年' + first.m + '月';
    if (first.y !== last.y || first.m !== last.m) period += '〜' + last.y + '年' + last.m + '月';
    head.appendChild(element('span', 'gbg-period', period));
    var now = parts(view.today);
    head.appendChild(element('span', 'gbg-printed', '作成 ' + now.y + '-' + pad(now.m) + '-' + pad(now.d) + '　' + (index + 1) + ' / ' + total));
    sheet.appendChild(head);

    var top = element('div', 'gbg-row gbg-header');
    var label = element('div', 'gbg-label');
    labelCells(label, ['作業', '担当', '進捗', '予定']);
    top.appendChild(label);
    var track = element('div', 'gbg-track');
    track.appendChild(renderScale(view));
    top.appendChild(track);
    sheet.appendChild(top);

    var body = element('div', 'gbg-body');
    body.appendChild(renderGrid(view));
    rows.forEach(function(row) {
      body.appendChild(renderRow(row, view));
    });
    sheet.appendChild(body);

    var legend = element('div', 'gbg-legend');
    legend.appendChild(element('span', 'gbg-key gbg-key-plan', '予定'));
    if (config.progress) legend.appendChild(element('span', 'gbg-key gbg-key-fill', '進捗'));
    if (config.actualStart) legend.appendChild(element('span', 'gbg-key gbg-key-actual', '実績'));
    legend.appendChild(element('span', 'gbg-key gbg-key-today', '今日'));
    sheet.appendChild(legend);
    return sheet;
  }

  function listQuery() {
    return (kintone.app.getQuery() || '').replace(/\s*limit\s+\d+(\s+offset\s+\d+)?\s*$/i, '').trim();
  }

  function fetchRecords(query) {
    var collected = [];
    var total = null;
    function step(offset) {
      var size = Math.min(FETCH_LIMIT, MAX_RECORDS - collected.length);
      var body = {app: kintone.app.getId(), query: (query ? query + ' ' : '') + 'limit ' + size + ' offset ' + offset};
      if (offset === 0) body.totalCount = true;
      return kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', body).then(function(response) {
        if (offset === 0 && response.totalCount !== null && response.totalCount !== undefined) total = Number(response.totalCount);
        collected = collected.concat(response.records);
        if (response.records.length < size || collected.length >= MAX_RECORDS) return {records: collected, total: total};
        return step(offset + size);
      });
    }
    return step(0);
  }

  function close() {
    var root = document.getElementById('gbg-report');
    if (root) root.parentNode.removeChild(root);
    document.body.classList.remove('gbg-printing');
  }

  function open(found) {
    var parsed = itemsOf(found.records);
    if (!parsed.items.length) {
      window.alert('工程表にできるレコードがありません。開始日と終了日を入れてください。');
      return;
    }
    close();
    var rows = rowsOf(parsed.items);
    var first = parsed.items.reduce(function(min, item) { return Math.min(min, item.start); }, Infinity);
    var lastEnd = parsed.items.reduce(function(max, item) { return Math.max(max, item.end); }, -Infinity);
    var from = monthStart(first);
    var need = 1;
    while (addMonths(from, need) <= lastEnd && need < 12) need++;
    var initial = MONTHS.filter(function(m) { return m >= need; })[0] || 12;

    var root = element('div');
    root.id = 'gbg-report';
    var tools = element('div', 'gbg-bar');
    var month = element('input', 'gbg-from');
    month.type = 'month';
    month.value = monthValue(from);
    var length = element('select', 'gbg-length');
    MONTHS.forEach(function(m) {
      var option = element('option', '', m + 'か月');
      option.value = String(m);
      length.appendChild(option);
    });
    length.value = String(initial);
    var paper = element('select', 'gbg-paper');
    Object.keys(PAPERS).forEach(function(key) {
      var option = element('option', '', PAPERS[key].label);
      option.value = key;
      paper.appendChild(option);
    });
    paper.value = PAPERS[config.paper] ? config.paper : 'a3';
    var print = element('button', 'gbg-print', '印刷');
    var shut = element('button', 'gbg-close', '閉じる');
    var status = element('span', 'gbg-status');
    print.type = shut.type = 'button';
    [month, length, paper, print, shut, status].forEach(function(node) {
      tools.appendChild(node);
    });
    root.appendChild(tools);
    var pagesBox = element('div', 'gbg-pages');
    root.appendChild(pagesBox);
    document.body.appendChild(root);
    document.body.classList.add('gbg-printing');

    function draw() {
      var m = /^(\d{4})-(\d{2})$/.exec(month.value);
      if (!m) return;
      var start = serial(m[1] + '-' + m[2] + '-01');
      var days = addMonths(start, Number(length.value)) - start;
      var view = {from: start, days: days, daily: days <= DAY_SCALE_LIMIT, today: today()};
      while (pagesBox.firstChild) pagesBox.removeChild(pagesBox.firstChild);
      var pages = paginate(rows, PAPERS[paper.value].rows);
      pages.forEach(function(pageRows, index) {
        pagesBox.appendChild(renderPage(pageRows, view, paper.value, index, pages.length));
      });
      var outside = parsed.items.filter(function(item) { return !visible(item.start, item.end, view); }).length;
      var notes = [parsed.items.length + '工程', pages.length + 'ページ（' + PAPERS[paper.value].label + '）'];
      if (outside) notes.push('表示期間の外 ' + outside + '件');
      if (parsed.noDate) notes.push('開始日か終了日が空の ' + parsed.noDate + '件は除外');
      if (parsed.reversed) notes.push('終了日が開始日より前の ' + parsed.reversed + '件は除外');
      if (found.total !== null && found.total > found.records.length) {
        notes.push('上限' + MAX_RECORDS + '件。残り ' + (found.total - found.records.length) + '件は、絞り込んでから表示してください');
      }
      status.textContent = notes.join('、');
    }

    month.addEventListener('change', draw);
    length.addEventListener('change', draw);
    paper.addEventListener('change', draw);
    print.addEventListener('click', function() {
      window.print();
    });
    shut.addEventListener('click', close);
    draw();
  }

  kintone.events.on('app.record.index.show', function(event) {
    var space = kintone.app.getHeaderMenuSpaceElement();
    if (space && !document.getElementById('gbg-open')) {
      var node = element('button', 'gbg-open', title + 'を表示');
      node.type = 'button';
      node.id = 'gbg-open';
      node.addEventListener('click', function() {
        fetchRecords(listQuery()).then(open).catch(function(error) {
          window.alert('工程表を作れませんでした。' + ((error && error.message) || ''));
        });
      });
      space.appendChild(node);
    }
    return event;
  });
})(kintone.$PLUGIN_ID);
