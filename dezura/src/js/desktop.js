(function(PLUGIN_ID) {
  'use strict';

  var MAX_RECORDS = 5000;
  var FETCH_LIMIT = 500;
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  var NO_NAME = '（会社名なし）';
  var SCALE = 10000;
  var config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  if (!config.date || !config.company || !config.amount) return;
  var title = config.title || '出面集計表';
  var stamps = (config.stamps || '').split(',').filter(Boolean).slice(0, 4);

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function thisMonth() {
    var now = new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1);
  }

  function daysIn(month) {
    var parts = month.split('-');
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]), 0)).getUTCDate();
  }

  function weekday(month, day) {
    var parts = month.split('-');
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, day)).getUTCDay();
  }

  function monthLabel(month) {
    var parts = month.split('-');
    return parts[0] + '年' + Number(parts[1]) + '月';
  }

  function text(field) {
    if (!field || field.value === null || field.value === undefined) return '';
    var value = field.value;
    if (Array.isArray(value)) return value.map(function(v) { return (v && typeof v === 'object') ? (v.name || v.code || '') : String(v); }).join('、');
    if (typeof value === 'object') return value.name || value.code || '';
    return String(value).trim();
  }

  // 誤差を避けるため整数にして足す。丸めるのは表示のときだけ（0.125人工が8件で1人工になるように）
  function amountOf(field) {
    var raw = text(field).replace(/,/g, '');
    if (raw === '') return null;
    if (!/^\d+(\.\d+)?$/.test(raw)) return NaN;
    return Math.round(Number(raw) * SCALE);
  }

  function format(hundredths) {
    return (Math.round(hundredths / (SCALE / 100)) / 100).toFixed(2).replace(/\.?0+$/, '');
  }

  function entriesOf(record) {
    var date = text(record[config.date]);
    if (!date) return [];
    var rows = config.table ? ((record[config.table] && record[config.table].value) || []).map(function(row) { return row.value; }) : [record];
    return rows.map(function(row) {
      return {
        date: date,
        company: text(row[config.company]) || NO_NAME,
        amount: amountOf(row[config.amount]),
        project: config.project ? text(row[config.project] || record[config.project]) : ''
      };
    });
  }

  function aggregate(records, month) {
    var result = {companies: {}, daily: {}, total: 0, invalid: 0, projects: [], lines: 0};
    records.forEach(function(record) {
      entriesOf(record).forEach(function(entry) {
        if (entry.date.slice(0, 7) !== month) return;
        if (entry.amount === null) return;
        if (isNaN(entry.amount)) {
          result.invalid++;
          return;
        }
        var day = Number(entry.date.slice(8, 10));
        var company = result.companies[entry.company];
        if (!company) company = result.companies[entry.company] = {name: entry.company, days: {}, projects: {}, total: 0};
        company.days[day] = (company.days[day] || 0) + entry.amount;
        company.total += entry.amount;
        if (entry.project) {
          company.projects[day] = company.projects[day] || [];
          if (company.projects[day].indexOf(entry.project) < 0) company.projects[day].push(entry.project);
          if (result.projects.indexOf(entry.project) < 0) result.projects.push(entry.project);
        }
        result.daily[day] = (result.daily[day] || 0) + entry.amount;
        result.total += entry.amount;
        result.lines++;
      });
    });
    result.list = Object.keys(result.companies).map(function(name) { return result.companies[name]; }).sort(function(a, b) {
      if (a.name === NO_NAME) return 1;
      if (b.name === NO_NAME) return -1;
      return a.name.localeCompare(b.name, 'ja');
    });
    return result;
  }

  function projectText(projects) {
    if (!projects.length) return '';
    var shown = projects.slice(0, 3).join('、');
    return '工事名 ' + shown + (projects.length > 3 ? ' ほか' + (projects.length - 3) + '件' : '');
  }

  function dayClass(month, day) {
    var w = weekday(month, day);
    return w === 0 ? 'gbz-sun' : (w === 6 ? 'gbz-sat' : '');
  }

  function renderSummary(data, month) {
    var last = daysIn(month);
    var sheet = element('section', 'gbz-sheet gbz-wide');
    var head = element('div', 'gbz-head');
    head.appendChild(element('h1', 'gbz-title', title + ' ' + monthLabel(month)));
    head.appendChild(element('span', 'gbz-projects', projectText(data.projects)));
    sheet.appendChild(head);

    var table = element('table', 'gbz-grid');
    var thead = element('thead');
    var row1 = element('tr');
    var row2 = element('tr');
    var nameHead = element('th', 'gbz-name', '協力会社');
    nameHead.rowSpan = 2;
    row1.appendChild(nameHead);
    for (var d = 1; d <= last; d++) {
      row1.appendChild(element('th', dayClass(month, d), String(d)));
      row2.appendChild(element('th', dayClass(month, d), WEEK[weekday(month, d)]));
    }
    var totalHead = element('th', 'gbz-total', '合計');
    totalHead.rowSpan = 2;
    row1.appendChild(totalHead);
    thead.appendChild(row1);
    thead.appendChild(row2);
    table.appendChild(thead);

    var tbody = element('tbody');
    data.list.forEach(function(company) {
      var tr = element('tr');
      tr.appendChild(element('th', 'gbz-name', company.name));
      for (var day = 1; day <= last; day++) {
        tr.appendChild(element('td', dayClass(month, day), company.days[day] ? format(company.days[day]) : ''));
      }
      tr.appendChild(element('td', 'gbz-total', format(company.total)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var tfoot = element('tfoot');
    var sum = element('tr');
    sum.appendChild(element('th', 'gbz-name', '日計'));
    for (var k = 1; k <= last; k++) {
      sum.appendChild(element('td', dayClass(month, k), data.daily[k] ? format(data.daily[k]) : ''));
    }
    sum.appendChild(element('td', 'gbz-total', format(data.total)));
    tfoot.appendChild(sum);
    table.appendChild(tfoot);
    sheet.appendChild(table);

    sheet.appendChild(element('p', 'gbz-foot', '協力会社 ' + data.list.length + '社 / 延べ ' + format(data.total) + '人工 / 単位：人工'));
    return sheet;
  }

  function renderCompany(company, month, index, total) {
    var last = daysIn(month);
    var sheet = element('section', 'gbz-sheet gbz-tall');
    var top = element('div', 'gbz-top');
    var titles = element('div');
    titles.appendChild(element('h1', 'gbz-title', '出面確認表 ' + monthLabel(month)));
    titles.appendChild(element('p', 'gbz-company', company.name));
    top.appendChild(titles);
    if (stamps.length) {
      var box = element('table', 'gbz-stamps');
      var labels = element('tr');
      var cells = element('tr');
      stamps.forEach(function(name) {
        labels.appendChild(element('th', '', name));
        cells.appendChild(element('td', '', ' '));
      });
      box.appendChild(labels);
      box.appendChild(cells);
      top.appendChild(box);
    }
    sheet.appendChild(top);

    var table = element('table', 'gbz-days');
    var thead = element('thead');
    var hr = element('tr');
    ['日', '曜', '人工', '工事名', '備考'].forEach(function(name) {
      hr.appendChild(element('th', '', name));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = element('tbody');
    for (var d = 1; d <= last; d++) {
      var tr = element('tr', dayClass(month, d));
      tr.appendChild(element('td', 'gbz-num', String(d)));
      tr.appendChild(element('td', '', WEEK[weekday(month, d)]));
      tr.appendChild(element('td', 'gbz-num', company.days[d] ? format(company.days[d]) : ''));
      tr.appendChild(element('td', '', (company.projects[d] || []).join('、')));
      tr.appendChild(element('td', '', ''));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    var tfoot = element('tfoot');
    var sum = element('tr');
    var label = element('th', '', '合計');
    label.colSpan = 2;
    sum.appendChild(label);
    sum.appendChild(element('td', 'gbz-num', format(company.total)));
    var rest = element('td', '', '');
    rest.colSpan = 2;
    sum.appendChild(rest);
    tfoot.appendChild(sum);
    table.appendChild(tfoot);
    sheet.appendChild(table);
    sheet.appendChild(element('p', 'gbz-foot', (index + 1) + ' / ' + total));
    return sheet;
  }

  function fetchRecords(month) {
    var condition = (kintone.app.getQueryCondition() || '').trim();
    var range = config.date + ' >= "' + month + '-01" and ' + config.date + ' <= "' + month + '-' + pad(daysIn(month)) + '"';
    var query = (condition ? '(' + condition + ') and ' : '') + range + ' order by $id asc';
    var collected = [];
    var total = null;
    function step(offset) {
      var size = Math.min(FETCH_LIMIT, MAX_RECORDS - collected.length);
      var body = {app: kintone.app.getId(), query: query + ' limit ' + size + ' offset ' + offset};
      if (offset === 0) body.totalCount = true;
      return kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', body).then(function(response) {
        if (offset === 0 && response.totalCount !== null && response.totalCount !== undefined) total = Number(response.totalCount);
        collected = collected.concat(response.records);
        if (response.records.length < size || collected.length >= MAX_RECORDS) return {records: collected, total: total, filtered: !!condition};
        return step(offset + size);
      });
    }
    return step(0);
  }

  function close() {
    var root = document.getElementById('gbz-report');
    if (root) root.parentNode.removeChild(root);
    document.body.classList.remove('gbz-printing');
  }

  function open() {
    close();
    var root = element('div');
    root.id = 'gbz-report';
    var bar = element('div', 'gbz-bar');
    var month = element('input', 'gbz-month');
    month.type = 'month';
    month.value = thisMonth();
    var mode = element('select', 'gbz-mode');
    [['summary', '集計表（A4横）'], ['company', '会社ごとの確認表（A4縦）'], ['both', '両方']].forEach(function(item) {
      var option = element('option', '', item[1]);
      option.value = item[0];
      mode.appendChild(option);
    });
    var print = element('button', 'gbz-print', '印刷');
    var shut = element('button', 'gbz-close', '閉じる');
    var status = element('span', 'gbz-status');
    print.type = shut.type = 'button';
    print.disabled = true;
    [month, mode, print, shut, status].forEach(function(node) {
      bar.appendChild(node);
    });
    root.appendChild(bar);
    var pages = element('div', 'gbz-pages');
    root.appendChild(pages);
    document.body.appendChild(root);
    document.body.classList.add('gbz-printing');

    var current = null;
    var request = 0;

    function draw() {
      while (pages.firstChild) pages.removeChild(pages.firstChild);
      if (!current || !current.data.list.length) return;
      if (mode.value !== 'company') pages.appendChild(renderSummary(current.data, current.month));
      if (mode.value !== 'summary') {
        current.data.list.forEach(function(company, index) {
          pages.appendChild(renderCompany(company, current.month, index, current.data.list.length));
        });
      }
    }

    function load() {
      var value = month.value;
      if (!/^\d{4}-\d{2}$/.test(value)) return;
      var mine = ++request;
      print.disabled = true;
      status.textContent = '読み込み中';
      fetchRecords(value).then(function(found) {
        if (mine !== request) return;
        var data = aggregate(found.records, value);
        current = {data: data, month: value};
        draw();
        if (!data.list.length) {
          status.textContent = monthLabel(value) + 'の出面がありません';
          return;
        }
        var notes = ['レコード ' + found.records.length + '件', '延べ ' + format(data.total) + '人工'];
        if (found.filtered) notes.push('一覧の絞り込み条件で集計');
        if (data.invalid) notes.push('人工が数字でない ' + data.invalid + '件は除外');
        if (found.total !== null && found.total > found.records.length) {
          notes.push('上限' + MAX_RECORDS + '件。残り ' + (found.total - found.records.length) + '件は集計していません');
        }
        status.textContent = notes.join('、');
        print.disabled = false;
      }).catch(function(error) {
        if (mine !== request) return;
        status.textContent = '集計できませんでした';
        window.alert('出面を集計できませんでした。' + ((error && error.message) || ''));
      });
    }

    month.addEventListener('change', load);
    mode.addEventListener('change', draw);
    print.addEventListener('click', function() {
      window.print();
    });
    shut.addEventListener('click', close);
    load();
  }

  kintone.events.on('app.record.index.show', function(event) {
    var space = kintone.app.getHeaderMenuSpaceElement();
    if (space && !document.getElementById('gbz-open')) {
      var node = element('button', 'gbz-open', '出面を月次集計');
      node.type = 'button';
      node.id = 'gbz-open';
      node.addEventListener('click', open);
      space.appendChild(node);
    }
    return event;
  });
})(kintone.$PLUGIN_ID);
