(function(PLUGIN_ID) {
  'use strict';

  var config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  if (!config.table || !config.name || !config.qty || !config.price) return;
  var OUTPUTS = ['outSub', 'outExp', 'outBase', 'outTax', 'outTotal'];
  var OUT_KEYS = {outSub: 'sub', outExp: 'exp', outBase: 'base', outTax: 'tax', outTotal: 'total'};
  var title = config.title || '御見積書';
  var stamps = (config.stamps || '').split(',').filter(Boolean).slice(0, 4);

  // ---- 計算 ----
  // 小数を「整数 × 10のマイナスs乗」で持ち、掛け算の誤差を出さない
  function parse(value) {
    var text = (value === null || value === undefined) ? '' : String(value).trim();
    if (text === '') return {empty: true, i: 0, s: 0};
    var m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (!m) return {bad: true, i: 0, s: 0};
    var frac = m[3] || '';
    var i = Number(m[2] + frac);
    if (!Number.isSafeInteger(i) || frac.length > 6) return {bad: true, i: 0, s: 0};
    return {i: m[1] === '-' ? -i : i, s: frac.length};
  }

  // n ÷ d を1円未満で四捨五入する（.5 は大きいほうへ。/tools/mitsumori/ の Math.round と同じ）
  function roundDiv(n, d) {
    return Math.floor((2 * n + d) / (2 * d));
  }

  function pow10(s) {
    return Math.pow(10, s);
  }

  function valueOf(record, code) {
    return code && record[code] ? record[code].value : '';
  }

  function yenOf(record, code, notes, label) {
    var v = parse(valueOf(record, code));
    if (v.bad) notes.push(label + 'が数ではありません');
    return roundDiv(v.i, pow10(v.s));
  }

  function calc(record) {
    var notes = [];
    var rows = (record[config.table] && record[config.table].value) || [];
    var sub = 0;
    var lines = rows.map(function(row, index) {
      var q = parse(valueOf(row.value, config.qty));
      var p = parse(valueOf(row.value, config.price));
      if (q.bad || p.bad) notes.push((index + 1) + '行目の数量か単価が数ではありません');
      if (q.empty && p.empty) return {row: row, amount: null};
      var product = q.i * p.i;
      if (!Number.isSafeInteger(product)) {
        notes.push((index + 1) + '行目の金額が大きすぎて計算できません');
        return {row: row, amount: null};
      }
      var amount = roundDiv(product, pow10(q.s + p.s));
      sub += amount;
      return {row: row, amount: amount};
    });
    var rateText = config.rateField ? valueOf(record, config.rateField) : config.rate;
    var rate = parse(rateText);
    if (rate.bad) notes.push('諸経費率が数ではありません');
    var exp = roundDiv(sub * rate.i, 100 * pow10(rate.s));
    var welfare = yenOf(record, config.welfare, notes, '法定福利費');
    var discount = yenOf(record, config.discount, notes, '値引き');
    var base = sub + exp + welfare - discount;
    // 消費税は10%、1円未満切り捨て（/tools/mitsumori/ と同じ Math.floor）
    var tax = Math.floor(base / 10);
    return {
      lines: lines, sub: sub, exp: exp, rate: rate.empty || rate.bad ? '' : String(rateText).trim(),
      welfare: welfare, discount: discount, base: base, tax: tax, total: base + tax, notes: notes
    };
  }

  // ---- 作成と編集の画面：計算結果をフィールドに入れる ----
  function lockOutputs(record) {
    OUTPUTS.forEach(function(key) {
      if (config[key] && record[config[key]]) record[config[key]].disabled = true;
    });
    if (config.amount && record[config.table]) {
      record[config.table].value.forEach(function(row) {
        if (row.value[config.amount]) row.value[config.amount].disabled = true;
      });
    }
  }

  function apply(record) {
    if (!record[config.table]) return record;
    var result = calc(record);
    if (config.amount) {
      result.lines.forEach(function(line) {
        var cell = line.row.value[config.amount];
        if (cell) cell.value = line.amount === null ? '' : String(line.amount);
      });
    }
    OUTPUTS.forEach(function(key) {
      var field = config[key] && record[config[key]];
      if (field) field.value = String(result[OUT_KEYS[key]]);
    });
    lockOutputs(record);
    return record;
  }

  function recalc(event) {
    apply(event.record);
    return event;
  }

  var watched = [config.table, config.qty, config.price, config.rateField, config.welfare, config.discount].filter(Boolean);
  var editEvents = ['app.record.create.show', 'app.record.edit.show', 'app.record.create.submit', 'app.record.edit.submit'];
  watched.forEach(function(code) {
    editEvents.push('app.record.create.change.' + code, 'app.record.edit.change.' + code);
  });
  kintone.events.on(editEvents, recalc);
  // 一覧の行内編集。テーブルが届かないときは計算しない
  kintone.events.on('app.record.index.edit.show', function(event) {
    lockOutputs(event.record);
    return event;
  });
  kintone.events.on('app.record.index.edit.submit', recalc);

  // ---- 見積書の印刷 ----
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

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function display(field) {
    if (!field || field.value === null || field.value === undefined || field.value === '') return '';
    var value = field.value;
    if (field.type === 'DATE' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      var d = value.split('-');
      return Number(d[0]) + '年' + Number(d[1]) + '月' + Number(d[2]) + '日';
    }
    if (field.type === 'DATETIME' || field.type === 'CREATED_TIME' || field.type === 'UPDATED_TIME') {
      var t = new Date(value);
      if (!isNaN(t.getTime())) return t.getFullYear() + '年' + (t.getMonth() + 1) + '月' + t.getDate() + '日 ' + pad(t.getHours()) + ':' + pad(t.getMinutes());
    }
    if (field.type === 'RICH_TEXT') {
      var doc = new DOMParser().parseFromString(String(value), 'text/html');
      return (doc.body.textContent || '').trim();
    }
    if (field.type === 'NUMBER' || field.type === 'CALC') return withDigits(value);
    if (Array.isArray(value)) return value.map(function(v) { return (v && typeof v === 'object') ? (v.name || v.code || '') : String(v); }).join('、');
    if (typeof value === 'object') return value.name || value.code || '';
    return String(value);
  }

  function text(record, key) {
    return config[key] ? display(record[config[key]]) : '';
  }

  // 合計の欄は、金額の列の下にそろえる。備考の列があれば、その下は空ける
  function sumRow(tbody, layout, label, value, className) {
    var tr = element('tr', 'gbe-sum' + (className ? ' ' + className : ''));
    var th = element('th', '', label);
    th.colSpan = layout.before;
    tr.appendChild(th);
    tr.appendChild(element('td', 'gbe-n', yen(value)));
    if (layout.after) {
      var rest = element('td', 'gbe-rest', ' ');
      rest.colSpan = layout.after;
      tr.appendChild(rest);
    }
    tbody.appendChild(tr);
  }

  function renderSheet(record, result) {
    var sheet = element('section', 'gbe-sheet');
    var head = element('div', 'gbe-head');
    var no = text(record, 'no');
    var date = text(record, 'date');
    head.appendChild(element('p', 'gbe-right', [no ? 'No. ' + no : '', date].filter(Boolean).join('\n')));
    head.appendChild(element('h1', 'gbe-title', title));
    sheet.appendChild(head);

    var parties = element('div', 'gbe-parties');
    var left = element('div', 'gbe-to');
    left.appendChild(element('p', 'gbe-to-name', text(record, 'to') || ' '));
    left.appendChild(element('p', 'gbe-lead', '下記のとおりお見積り申し上げます。'));
    var total = element('div', 'gbe-total');
    total.appendChild(element('span', '', 'お見積金額'));
    total.appendChild(element('b', '', '¥' + yen(result.total) + '-'));
    total.appendChild(element('span', 'gbe-small', '（消費税込み）'));
    left.appendChild(total);
    var info = element('table', 'gbe-info');
    [['工事名', 'project'], ['工事場所', 'place'], ['工期', 'term'], ['有効期限', 'limit'], ['お支払い条件', 'pay']].forEach(function(item) {
      var value = text(record, item[1]);
      if (!value) return;
      var tr = element('tr');
      tr.appendChild(element('th', '', item[0]));
      tr.appendChild(element('td', '', value));
      info.appendChild(tr);
    });
    if (info.firstChild) left.appendChild(info);
    parties.appendChild(left);
    var right = element('div', 'gbe-from');
    if (config.company) right.appendChild(element('p', 'gbe-company', config.company));
    if (stamps.length) {
      var box = element('table', 'gbe-stamps');
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

    var columns = [['品名', 'name', ''], ['規格・仕様', 'spec', ''], ['数量', 'qty', 'gbe-n'], ['単位', 'unit', 'gbe-c'], ['単価', 'price', 'gbe-n'], ['金額', null, 'gbe-n'], ['備考', 'remark', '']]
      .filter(function(c) { return c[1] === null || config[c[1]]; });
    var table = element('table', 'gbe-lines');
    var thead = element('thead');
    var hr = element('tr');
    columns.forEach(function(c) { hr.appendChild(element('th', 'gbe-col-' + (c[1] || 'amount'), c[0])); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = element('tbody');
    result.lines.forEach(function(line) {
      var row = line.row.value;
      var empty = columns.every(function(c) { return !c[1] || !valueOf(row, config[c[1]]); });
      if (empty) return;
      var tr = element('tr', line.amount === null ? 'gbe-heading' : '');
      columns.forEach(function(c) {
        var value;
        if (c[1] === null) value = line.amount === null ? '' : yen(line.amount);
        else if (c[1] === 'qty' || c[1] === 'price') value = withDigits(valueOf(row, config[c[1]]));
        else value = display(row[config[c[1]]]);
        tr.appendChild(element('td', c[2], value));
      });
      tbody.appendChild(tr);
    });
    var at = columns.map(function(c) { return c[1]; }).indexOf(null);
    var cols = {before: at, after: columns.length - at - 1};
    sumRow(tbody, cols, '小計', result.sub, 'gbe-first');
    if (result.exp) sumRow(tbody, cols, '諸経費' + (result.rate ? '（' + result.rate + '%）' : ''), result.exp);
    if (result.welfare) sumRow(tbody, cols, '法定福利費', result.welfare);
    if (result.discount) sumRow(tbody, cols, '値引き', -result.discount);
    sumRow(tbody, cols, '税抜合計（10%対象）', result.base);
    sumRow(tbody, cols, '消費税（10%）', result.tax);
    sumRow(tbody, cols, '合計（税込）', result.total, 'gbe-grand');
    table.appendChild(tbody);
    sheet.appendChild(table);

    var note = text(record, 'note');
    if (note) {
      var box2 = element('div', 'gbe-notes');
      box2.appendChild(element('b', '', '備考'));
      box2.appendChild(element('p', '', note));
      sheet.appendChild(box2);
    }
    sheet.appendChild(element('p', 'gbe-foot', record.$id ? 'レコード番号 ' + record.$id.value : ''));
    return sheet;
  }

  // 保存されている計算結果と、今の計算が違うかを見る
  function stale(record, result) {
    return OUTPUTS.filter(function(key) {
      var field = config[key] && record[config[key]];
      if (!field || field.value === '' || field.value === null || field.value === undefined) return false;
      return Number(field.value) !== result[OUT_KEYS[key]];
    }).length;
  }

  function close() {
    var root = document.getElementById('gbe-report');
    if (root) root.parentNode.removeChild(root);
    document.body.classList.remove('gbe-printing');
  }

  function open(record) {
    close();
    var result = calc(record);
    var root = element('div');
    root.id = 'gbe-report';
    var bar = element('div', 'gbe-bar');
    var print = element('button', 'gbe-print', '印刷');
    var shut = element('button', 'gbe-close', '閉じる');
    var status = element('span', 'gbe-status');
    print.type = shut.type = 'button';
    bar.appendChild(print);
    bar.appendChild(shut);
    bar.appendChild(status);
    root.appendChild(bar);
    root.appendChild(renderSheet(record, result));
    document.body.appendChild(root);
    document.body.classList.add('gbe-printing');
    var notes = result.notes.slice(0, 5);
    var diff = stale(record, result);
    if (diff) notes.push('保存されている計算結果と違う項目が' + diff + 'つあります。印刷は計算し直した値です。編集して保存すると直ります');
    status.textContent = notes.length ? notes.join('。') : '';
    if (notes.length) status.classList.add('gbe-warn');
    print.addEventListener('click', function() {
      window.print();
    });
    shut.addEventListener('click', close);
  }

  kintone.events.on('app.record.detail.show', function(event) {
    var space = kintone.app.record.getHeaderMenuSpaceElement();
    if (space && !document.getElementById('gbe-open')) {
      var node = element('button', 'gbe-open', title + 'を印刷');
      node.type = 'button';
      node.id = 'gbe-open';
      node.addEventListener('click', function() {
        var current = kintone.app.record.get();
        open((current && current.record) || event.record);
      });
      space.appendChild(node);
    }
    return event;
  });
})(kintone.$PLUGIN_ID);
