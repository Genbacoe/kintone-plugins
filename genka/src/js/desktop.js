(function(PLUGIN_ID) {
  'use strict';

  var config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  if (!config.table || !config.item || !config.budget || !config.actual) return;
  var MAX_RECORDS = 2000;
  var FETCH_LIMIT = 500;
  var NO_ITEM = '（費目なし）';
  var title = config.title || '実行予算 予実表';
  var stamps = (config.stamps || '').split(',').filter(Boolean).slice(0, 4);
  // 実績が別のテーブルなら、その費目で突き合わせる。同じテーブルなら同じ行の費目
  var actualTable = config.actualTable || config.table;
  var actualItem = config.actualTable ? config.actualItem : config.item;
  var sameTable = actualTable === config.table;
  var OUTPUTS = {outBudget: 'budget', outActual: 'actual', outDiff: 'diff', outRate: 'rate'};

  // ---- 計算 ----
  // 小数を「整数 × 10のマイナスs乗」で持ち、誤差を出さない
  function parse(value) {
    var text = (value === null || value === undefined) ? '' : String(value).replace(/,/g, '').trim();
    if (text === '') return {empty: true, i: 0, s: 0};
    var m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (!m) return {bad: true, i: 0, s: 0};
    var frac = m[3] || '';
    var i = Number(m[2] + frac);
    if (!Number.isSafeInteger(i) || frac.length > 6) return {bad: true, i: 0, s: 0};
    return {i: m[1] === '-' ? -i : i, s: frac.length};
  }

  // n ÷ d を四捨五入する（.5 は大きいほうへ）
  function roundDiv(n, d) {
    return Math.floor((2 * n + d) / (2 * d));
  }

  var warn = parse(config.warn === undefined || config.warn === '' ? '90' : config.warn);
  if (warn.bad || warn.empty) warn = {i: 90, s: 0};

  // 消化率（%）を小数1桁で。予算が0以下なら出さない
  function rateOf(actual, budget) {
    if (budget <= 0) return null;
    var n = actual * 1000;
    if (!Number.isSafeInteger(n)) return null;
    return roundDiv(n, budget) / 10;
  }

  // over：実績が予算を超えた。warn：表に出す消化率（小数1桁）が注意の線以上
  var warn10 = warn.s > 1 ? Math.round(warn.i / Math.pow(10, warn.s - 1)) : warn.i * (warn.s ? 1 : 10);
  function stateOf(actual, budget) {
    if (actual > budget) return 'over';
    var rate = rateOf(actual, budget);
    if (rate !== null && Math.round(rate * 10) >= warn10) return 'warn';
    return '';
  }

  function plain(field) {
    if (!field || field.value === null || field.value === undefined) return '';
    var value = field.value;
    if (Array.isArray(value)) return value.map(function(v) { return (v && typeof v === 'object') ? (v.name || v.code || '') : String(v); }).join('、');
    if (typeof value === 'object') return value.name || value.code || '';
    return String(value).trim();
  }

  function valueOf(record, code) {
    return code && record[code] ? record[code].value : '';
  }

  function rowsOf(record, code) {
    return (record[code] && record[code].value) || [];
  }

  function calc(record) {
    var notes = [];
    var groups = [];
    var byName = {};
    function group(name) {
      var key = name || NO_ITEM;
      if (!byName[key]) {
        byName[key] = {name: key, budget: 0, actual: 0, budgetRows: 0, actualRows: 0};
        groups.push(byName[key]);
      }
      return byName[key];
    }
    var rowResults = [];
    rowsOf(record, config.table).forEach(function(row, index) {
      var name = plain(row.value[config.item]);
      var b = parse(valueOf(row.value, config.budget));
      var a = sameTable ? parse(valueOf(row.value, config.actual)) : {empty: true, i: 0, s: 0};
      if (b.bad) notes.push((index + 1) + '行目の実行予算が数ではありません');
      if (a.bad) notes.push((index + 1) + '行目の実績が数ではありません');
      if (!name && b.empty && a.empty) {
        rowResults.push(null);
        return;
      }
      var budget = roundDiv(b.i, Math.pow(10, b.s));
      var actual = roundDiv(a.i, Math.pow(10, a.s));
      var g = group(name);
      g.budget += budget;
      g.budgetRows++;
      if (sameTable) {
        g.actual += actual;
        if (!a.empty) g.actualRows++;
      }
      rowResults.push({row: row, budget: budget, actual: actual, empty: b.empty && a.empty});
    });
    if (!sameTable) {
      rowsOf(record, actualTable).forEach(function(row, index) {
        var name = plain(row.value[actualItem]);
        var a = parse(valueOf(row.value, config.actual));
        if (a.bad) notes.push('実績の' + (index + 1) + '行目が数ではありません');
        if (a.empty) return;
        var g = group(name);
        g.actual += roundDiv(a.i, Math.pow(10, a.s));
        g.actualRows++;
      });
    }
    var budget = 0;
    var actual = 0;
    groups.forEach(function(g) {
      g.diff = g.budget - g.actual;
      g.rate = rateOf(g.actual, g.budget);
      g.state = stateOf(g.actual, g.budget);
      budget += g.budget;
      actual += g.actual;
    });
    var result = {
      groups: groups, rows: rowResults, budget: budget, actual: actual, diff: budget - actual, rate: rateOf(actual, budget),
      state: stateOf(actual, budget), notes: notes,
      over: groups.filter(function(g) { return g.state === 'over'; }).length,
      warned: groups.filter(function(g) { return g.state === 'warn'; }).length
    };
    if (config.contract) {
      var c = parse(valueOf(record, config.contract));
      if (c.bad) notes.push('請負金額が数ではありません');
      if (!c.empty && !c.bad) {
        result.contract = roundDiv(c.i, Math.pow(10, c.s));
        result.profit = result.contract - budget;
        result.profitRate = rateOf(result.profit, result.contract);
      }
    }
    return result;
  }

  // ---- 作成と編集の画面：計算結果をフィールドに入れる ----
  function lockOutputs(record) {
    Object.keys(OUTPUTS).forEach(function(key) {
      if (config[key] && record[config[key]]) record[config[key]].disabled = true;
    });
    if (sameTable && record[config.table]) {
      record[config.table].value.forEach(function(row) {
        ['rowDiff', 'rowRate'].forEach(function(key) {
          if (config[key] && row.value[config[key]]) row.value[config[key]].disabled = true;
        });
      });
    }
  }

  function apply(record) {
    // 一覧の行内編集などでテーブルが届かないときは、書き込み先を0にしないよう何もしない
    if (!record[config.table] || !record[actualTable]) {
      lockOutputs(record);
      return record;
    }
    var result = calc(record);
    Object.keys(OUTPUTS).forEach(function(key) {
      var field = config[key] && record[config[key]];
      if (!field) return;
      var value = result[OUTPUTS[key]];
      field.value = value === null ? '' : String(value);
    });
    if (sameTable) {
      result.rows.forEach(function(line) {
        if (!line) return;
        var diffCell = config.rowDiff && line.row.value[config.rowDiff];
        var rateCell = config.rowRate && line.row.value[config.rowRate];
        if (diffCell) diffCell.value = line.empty ? '' : String(line.budget - line.actual);
        if (rateCell) {
          var r = rateOf(line.actual, line.budget);
          rateCell.value = r === null ? '' : String(r);
        }
      });
    }
    lockOutputs(record);
    return record;
  }

  function recalc(event) {
    apply(event.record);
    return event;
  }

  var watched = [config.table, config.budget, config.actual, config.actualTable].filter(Boolean);
  var editEvents = ['app.record.create.show', 'app.record.edit.show', 'app.record.create.submit', 'app.record.edit.submit'];
  watched.forEach(function(code) {
    editEvents.push('app.record.create.change.' + code, 'app.record.edit.change.' + code);
  });
  kintone.events.on(editEvents, recalc);
  kintone.events.on('app.record.index.edit.show', function(event) {
    lockOutputs(event.record);
    return event;
  });
  kintone.events.on('app.record.index.edit.submit', recalc);

  // ---- 表示 ----
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function withDigits(value) {
    var text = String(value);
    var m = /^(-?)(\d+)(\.\d+)?$/.exec(text);
    if (!m) return text;
    return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] || '');
  }

  function yen(n) {
    return (n < 0 ? '−' : '') + withDigits(Math.abs(n));
  }

  function percent(r) {
    return r === null || r === undefined ? '—' : r.toFixed(1) + '%';
  }

  var STATE_LABEL = {over: '超過', warn: '注意', '': ''};

  function display(field) {
    if (!field || field.value === null || field.value === undefined || field.value === '') return '';
    var value = field.value;
    if (field.type === 'DATE' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      var d = value.split('-');
      return Number(d[0]) + '年' + Number(d[1]) + '月' + Number(d[2]) + '日';
    }
    if (field.type === 'NUMBER' || field.type === 'CALC') return withDigits(value);
    return plain(field);
  }

  function text(record, key) {
    return config[key] ? display(record[config[key]]) : '';
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  // 消化率の横棒。100%を超えた分は太い枠の外に伸ばさず、満杯の赤で示す
  function bar(rate, state) {
    var track = element('span', 'gbc-track');
    var fill = element('span', 'gbc-fill' + (state ? ' gbc-' + state : ''));
    var width = rate === null ? (state === 'over' ? 100 : 0) : Math.max(0, Math.min(100, rate));
    fill.style.width = width + '%';
    track.appendChild(fill);
    return track;
  }

  function cell(tr, tag, className, value) {
    var node = element(tag, className, value);
    tr.appendChild(node);
    return node;
  }

  function itemTable(result) {
    var table = element('table', 'gbc-table');
    var thead = element('thead');
    var hr = element('tr');
    [['費目', 'gbc-col-item'], ['実行予算', 'gbc-col-n'], ['実績', 'gbc-col-n'], ['差額（残り）', 'gbc-col-n'], ['消化率', 'gbc-col-rate'], ['', 'gbc-col-bar']].forEach(function(c) {
      cell(hr, 'th', c[1], c[0]);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = element('tbody');
    result.groups.forEach(function(g) {
      var tr = element('tr', g.state ? 'gbc-row-' + g.state : '');
      var name = cell(tr, 'td', 'gbc-item', g.name);
      if (g.state) name.appendChild(element('span', 'gbc-mark gbc-mark-' + g.state, STATE_LABEL[g.state]));
      cell(tr, 'td', 'gbc-n', yen(g.budget));
      cell(tr, 'td', 'gbc-n', yen(g.actual));
      cell(tr, 'td', 'gbc-n' + (g.diff < 0 ? ' gbc-minus' : ''), yen(g.diff));
      cell(tr, 'td', 'gbc-n', g.budget <= 0 && g.actual > 0 ? '予算なし' : percent(g.rate));
      cell(tr, 'td', 'gbc-barcell').appendChild(bar(g.rate, g.state));
      tbody.appendChild(tr);
    });
    var total = element('tr', 'gbc-total' + (result.state ? ' gbc-row-' + result.state : ''));
    cell(total, 'th', '', '合計');
    cell(total, 'td', 'gbc-n', yen(result.budget));
    cell(total, 'td', 'gbc-n', yen(result.actual));
    cell(total, 'td', 'gbc-n' + (result.diff < 0 ? ' gbc-minus' : ''), yen(result.diff));
    cell(total, 'td', 'gbc-n', percent(result.rate));
    cell(total, 'td', 'gbc-barcell').appendChild(bar(result.rate, result.state));
    tbody.appendChild(total);
    table.appendChild(tbody);
    return table;
  }

  function legend() {
    return element('p', 'gbc-legend', '差額＝実行予算−実績（マイナスは予算超過）。消化率＝実績÷実行予算。赤は予算超過、黄色は消化率' + withDigits(String(warn.i / Math.pow(10, warn.s))) + '%以上。同じ費目の行は合算しています。');
  }

  function summaryBoxes(result) {
    var box = element('div', 'gbc-boxes');
    var items = [];
    if (result.contract !== undefined) items.push(['請負金額', yen(result.contract), '']);
    items.push(['実行予算', yen(result.budget), '']);
    if (result.contract !== undefined) items.push(['予定粗利', yen(result.profit) + (result.profitRate === null ? '' : '（' + percent(result.profitRate) + '）'), result.profit < 0 ? 'gbc-minus' : '']);
    items.push(['実績', yen(result.actual), '']);
    items.push(['残り', yen(result.diff), result.diff < 0 ? 'gbc-minus' : '']);
    items.push(['消化率', percent(result.rate), '']);
    if (items.length > 4) box.classList.add('gbc-six');
    items.forEach(function(item) {
      var one = element('div', 'gbc-box');
      one.appendChild(element('span', '', item[0]));
      one.appendChild(element('b', item[2], item[1]));
      box.appendChild(one);
    });
    return box;
  }

  function renderSheet(record, result) {
    var sheet = element('section', 'gbc-sheet');
    var head = element('div', 'gbc-head');
    var no = text(record, 'no');
    head.appendChild(element('p', 'gbc-right', [no ? 'No. ' + no : '', '作成日 ' + today()].filter(Boolean).join('\n')));
    head.appendChild(element('h1', 'gbc-title', title));
    sheet.appendChild(head);

    var parties = element('div', 'gbc-parties');
    var info = element('table', 'gbc-info');
    [['工事名', 'project'], ['発注者', 'client'], ['工期', 'term'], ['担当', 'person']].forEach(function(item) {
      var value = text(record, item[1]);
      if (!value) return;
      var tr = element('tr');
      tr.appendChild(element('th', '', item[0]));
      tr.appendChild(element('td', '', value));
      info.appendChild(tr);
    });
    var left = element('div', 'gbc-left');
    if (info.firstChild) left.appendChild(info);
    parties.appendChild(left);
    var right = element('div', 'gbc-from');
    if (config.company) right.appendChild(element('p', 'gbc-company', config.company));
    if (stamps.length) {
      var box = element('table', 'gbc-stamps');
      var labels = element('tr');
      var cells = element('tr');
      stamps.forEach(function(name) {
        labels.appendChild(element('th', '', name));
        cells.appendChild(element('td', '', ' '));
      });
      box.appendChild(labels);
      box.appendChild(cells);
      right.appendChild(box);
    }
    parties.appendChild(right);
    sheet.appendChild(parties);
    sheet.appendChild(summaryBoxes(result));
    sheet.appendChild(itemTable(result));
    sheet.appendChild(legend());
    sheet.appendChild(element('p', 'gbc-foot', record.$id ? 'レコード番号 ' + record.$id.value : ''));
    return sheet;
  }

  // 保存されている計算結果と、今の計算が違うかを見る
  function stale(record, result) {
    return Object.keys(OUTPUTS).filter(function(key) {
      var field = config[key] && record[config[key]];
      if (!field || field.value === '' || field.value === null || field.value === undefined) return false;
      var want = result[OUTPUTS[key]];
      return want === null || Number(field.value) !== want;
    }).length;
  }

  function close() {
    var root = document.getElementById('gbc-report');
    if (root) root.parentNode.removeChild(root);
    document.body.classList.remove('gbc-printing');
  }

  function overlay(status) {
    close();
    var root = element('div');
    root.id = 'gbc-report';
    var tools = element('div', 'gbc-bar');
    var print = element('button', 'gbc-print', '印刷');
    var shut = element('button', 'gbc-close', '閉じる');
    print.type = shut.type = 'button';
    tools.appendChild(print);
    tools.appendChild(shut);
    tools.appendChild(status);
    root.appendChild(tools);
    document.body.appendChild(root);
    document.body.classList.add('gbc-printing');
    print.addEventListener('click', function() {
      window.print();
    });
    shut.addEventListener('click', close);
    return {root: root, print: print};
  }

  function notesOf(result, extra) {
    var notes = result.notes.slice(0, 5);
    if (extra) notes.push(extra);
    return notes;
  }

  function openSheet(record) {
    var result = calc(record);
    var status = element('span', 'gbc-status');
    var view = overlay(status);
    view.root.appendChild(renderSheet(record, result));
    var diff = stale(record, result);
    var notes = notesOf(result, diff ? '保存されている計算結果と違う項目が' + diff + 'つあります。表は計算し直した値です。編集して保存すると直ります' : '');
    status.textContent = notes.join('。');
    if (notes.length) status.classList.add('gbc-warn');
  }

  function chip(result) {
    var node = element('span', 'gbc-chip' + (result.state ? ' gbc-chip-' + result.state : ''));
    var parts = ['消化率 ' + percent(result.rate)];
    if (result.over) parts.push('超過 ' + result.over + '費目');
    if (result.warned) parts.push('注意 ' + result.warned + '費目');
    node.textContent = parts.join('｜');
    return node;
  }

  kintone.events.on('app.record.detail.show', function(event) {
    var result = calc(event.record);
    var space = kintone.app.record.getHeaderMenuSpaceElement();
    if (space && !document.getElementById('gbc-open')) {
      var node = element('button', 'gbc-open', '予実表を印刷');
      node.type = 'button';
      node.id = 'gbc-open';
      node.addEventListener('click', function() {
        var current = kintone.app.record.get();
        openSheet((current && current.record) || event.record);
      });
      space.appendChild(node);
    }
    if (space) {
      var before = space.querySelector('.gbc-chip');
      if (before) before.parentNode.removeChild(before);
      space.appendChild(chip(result));
    }
    var target = config.space && kintone.app.record.getSpaceElement(config.space);
    if (target) {
      var old = target.querySelector('.gbc-panel');
      if (old) target.removeChild(old);
      var panel = element('div', 'gbc-panel');
      panel.appendChild(summaryBoxes(result));
      panel.appendChild(itemTable(result));
      panel.appendChild(legend());
      target.appendChild(panel);
    }
    return event;
  });

  // ---- 一覧：工事ごとの予実をまとめる ----
  function listQuery() {
    return (kintone.app.getQuery() || '').replace(/\s*limit\s+\d+(\s+offset\s+\d+)?\s*$/i, '').trim();
  }

  function fetchRecords(query) {
    var fields = ['$id', config.table, actualTable, config.contract, config.project, config.no].filter(function(code, index, all) { return code && all.indexOf(code) === index; });
    var collected = [];
    var total = null;
    function step(offset) {
      var size = Math.min(FETCH_LIMIT, MAX_RECORDS - collected.length);
      var body = {app: kintone.app.getId(), query: (query ? query + ' ' : '') + 'limit ' + size + ' offset ' + offset, fields: fields};
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

  function renderList(records) {
    var sheet = element('section', 'gbc-sheet gbc-wide');
    var head = element('div', 'gbc-head');
    head.appendChild(element('p', 'gbc-right', '作成日 ' + today()));
    head.appendChild(element('h1', 'gbc-title', '工事別 予実一覧'));
    sheet.appendChild(head);
    var hasContract = !!config.contract;
    var table = element('table', 'gbc-table gbc-list');
    var thead = element('thead');
    var hr = element('tr');
    var columns = [['工事', 'gbc-col-item']];
    if (hasContract) columns.push(['請負金額', 'gbc-col-n']);
    columns = columns.concat([['実行予算', 'gbc-col-n']]);
    if (hasContract) columns.push(['予定粗利', 'gbc-col-n']);
    columns = columns.concat([['実績', 'gbc-col-n'], ['差額（残り）', 'gbc-col-n'], ['消化率', 'gbc-col-rate'], ['', 'gbc-col-bar'], ['超過した費目', 'gbc-col-over']]);
    columns.forEach(function(c) { cell(hr, 'th', c[1], c[0]); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = element('tbody');
    var sums = {contract: 0, budget: 0, actual: 0, profit: 0};
    var counts = {over: 0, warn: 0};
    records.forEach(function(record) {
      var r = calc(record);
      var tr = element('tr', r.state ? 'gbc-row-' + r.state : (r.over ? 'gbc-row-part' : ''));
      var name = [text(record, 'no'), text(record, 'project')].filter(Boolean).join(' ') || ('レコード ' + (record.$id ? record.$id.value : ''));
      var first = cell(tr, 'td', 'gbc-item', name);
      if (r.state) first.appendChild(element('span', 'gbc-mark gbc-mark-' + r.state, STATE_LABEL[r.state]));
      if (hasContract) cell(tr, 'td', 'gbc-n', r.contract === undefined ? '' : yen(r.contract));
      cell(tr, 'td', 'gbc-n', yen(r.budget));
      if (hasContract) cell(tr, 'td', 'gbc-n' + (r.profit < 0 ? ' gbc-minus' : ''), r.contract === undefined ? '' : yen(r.profit));
      cell(tr, 'td', 'gbc-n', yen(r.actual));
      cell(tr, 'td', 'gbc-n' + (r.diff < 0 ? ' gbc-minus' : ''), yen(r.diff));
      cell(tr, 'td', 'gbc-n', percent(r.rate));
      cell(tr, 'td', 'gbc-barcell').appendChild(bar(r.rate, r.state));
      cell(tr, 'td', 'gbc-overs', r.groups.filter(function(g) { return g.state === 'over'; }).map(function(g) { return g.name; }).join('、'));
      tbody.appendChild(tr);
      sums.budget += r.budget;
      sums.actual += r.actual;
      if (r.contract !== undefined) {
        sums.contract += r.contract;
        sums.profit += r.profit;
      }
      if (r.state === 'over') counts.over++;
      if (r.state === 'warn') counts.warn++;
    });
    var total = element('tr', 'gbc-total');
    cell(total, 'th', '', '合計（' + records.length + '件）');
    if (hasContract) cell(total, 'td', 'gbc-n', yen(sums.contract));
    cell(total, 'td', 'gbc-n', yen(sums.budget));
    if (hasContract) cell(total, 'td', 'gbc-n' + (sums.profit < 0 ? ' gbc-minus' : ''), yen(sums.profit));
    cell(total, 'td', 'gbc-n', yen(sums.actual));
    cell(total, 'td', 'gbc-n' + (sums.budget - sums.actual < 0 ? ' gbc-minus' : ''), yen(sums.budget - sums.actual));
    var rate = rateOf(sums.actual, sums.budget);
    cell(total, 'td', 'gbc-n', percent(rate));
    cell(total, 'td', 'gbc-barcell').appendChild(bar(rate, stateOf(sums.actual, sums.budget)));
    cell(total, 'td', '', '');
    tbody.appendChild(total);
    table.appendChild(tbody);
    sheet.appendChild(table);
    sheet.appendChild(element('p', 'gbc-legend', '全体で予算超過 ' + counts.over + '件、注意 ' + counts.warn + '件。差額＝実行予算−実績。赤は予算超過、黄色は消化率' + withDigits(String(warn.i / Math.pow(10, warn.s))) + '%以上。' + (hasContract ? '予定粗利＝請負金額−実行予算。' : '') + '一覧の絞り込みと並び順のままです。'));
    return sheet;
  }

  function openList() {
    var status = element('span', 'gbc-status', '読み込み中…');
    var view = overlay(status);
    view.print.disabled = true;
    fetchRecords(listQuery()).then(function(found) {
      if (!document.body.contains(view.root)) return;
      if (!found.records.length) {
        status.textContent = 'この一覧にレコードがありません。';
        return;
      }
      view.root.appendChild(renderList(found.records));
      var notes = [];
      if (found.total !== null && found.total > found.records.length) notes.push('先頭の' + found.records.length + '件だけを表にしました（全' + found.total + '件）。一覧で絞り込んでください');
      status.textContent = notes.join('。');
      status.classList.toggle('gbc-warn', notes.length > 0);
      view.print.disabled = false;
    }).catch(function(error) {
      status.textContent = 'レコードを読み込めませんでした。' + ((error && error.message) || '');
      status.classList.add('gbc-warn');
    });
  }

  // 一覧に出ている消化率と差額の欄を色分けする
  function paintCells(records) {
    var rateCells = config.outRate ? kintone.app.getFieldElements(config.outRate) : null;
    var diffCells = config.outDiff ? kintone.app.getFieldElements(config.outDiff) : null;
    records.forEach(function(record, index) {
      var b = parse(valueOf(record, config.outBudget));
      var a = parse(valueOf(record, config.outActual));
      var r = parse(valueOf(record, config.outRate));
      var d = parse(valueOf(record, config.outDiff));
      var state = '';
      if (config.outBudget && config.outActual && !b.empty && !a.empty && !b.bad && !a.bad) {
        state = stateOf(roundDiv(a.i, Math.pow(10, a.s)), roundDiv(b.i, Math.pow(10, b.s)));
      } else {
        if (!r.empty && !r.bad) {
          // 消化率だけ分かるとき：100%超は超過、注意の線以上は注意
          var rate10 = Math.round(r.i * 10 / Math.pow(10, r.s));
          state = rate10 > 1000 ? 'over' : (rate10 >= warn10 ? 'warn' : '');
        }
        if (!d.empty && !d.bad && d.i < 0) state = 'over';
      }
      [rateCells, diffCells].forEach(function(cells) {
        var node = cells && cells[index];
        if (!node) return;
        node.classList.remove('gbc-cell-over', 'gbc-cell-warn');
        if (state) node.classList.add('gbc-cell-' + state);
      });
    });
  }

  kintone.events.on('app.record.index.show', function(event) {
    if (event.viewType !== 'list') return event;
    var space = kintone.app.getHeaderMenuSpaceElement();
    if (space && !document.getElementById('gbc-list-open')) {
      var node = element('button', 'gbc-open', '工事別の予実一覧');
      node.type = 'button';
      node.id = 'gbc-list-open';
      node.addEventListener('click', openList);
      space.appendChild(node);
    }
    if (event.records) paintCells(event.records);
    return event;
  });
})(kintone.$PLUGIN_ID);
