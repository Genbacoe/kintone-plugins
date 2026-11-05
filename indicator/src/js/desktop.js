(function(PLUGIN_ID) {
  'use strict';

  var DAY = 86400000;
  var MIN_COLUMN = 100;
  var config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  var rules = [];
  try {
    rules = config.rules ? JSON.parse(config.rules) : [];
  } catch (e) {
    rules = [];
  }
  if (!Array.isArray(rules)) rules = [];
  rules = rules.filter(function(r) { return r && r.field && (r.kind === 'bar' || r.kind === 'steps'); });
  if (!rules.length) return;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function valueOf(record, code) {
    var field = code && record[code];
    if (!field || field.value === null || field.value === undefined) return '';
    return String(field.value).trim();
  }

  function number(text) {
    return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  // 小数1桁にして桁区切りを付ける（2000000 → 2,000,000）
  function digits(n) {
    var parts = String(round1(n)).split('.');
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts[1] ? '.' + parts[1] : '');
  }

  function startOfToday() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  // 日付だけの値は端末の暦のその日、日時は端末の時刻の日付として数える
  function dayOf(value) {
    if (!value) return null;
    var date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value);
    if (isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  // 予定の進み具合（%）。開始日と終了日を両方とも1日と数える
  function planPercent(rule, record) {
    if (rule.plan === 'field') {
      var planned = number(valueOf(record, rule.planField));
      return planned === null ? null : planned / Number(rule.max) * 100;
    }
    if (rule.plan === 'dates') {
      var start = dayOf(valueOf(record, rule.start));
      var end = dayOf(valueOf(record, rule.end));
      if (start === null || end === null || end < start) return null;
      var today = startOfToday();
      if (today < start) return 0;
      if (today >= end) return 100;
      var total = Math.round((end - start) / DAY) + 1;
      var elapsed = Math.round((today - start) / DAY) + 1;
      return elapsed / total * 100;
    }
    return null;
  }

  function measure(rule, record) {
    var value = number(valueOf(record, rule.field));
    var max = Number(rule.max) || 100;
    var result = {value: value, max: max, percent: null, plan: planPercent(rule, record), behind: 0};
    if (value === null) return result;
    result.percent = value / max * 100;
    if (result.plan !== null) {
      var gap = Math.round(Math.min(result.plan, 100) - Math.min(result.percent, 100));
      if (gap >= 1) result.behind = gap;
    }
    return result;
  }

  function clamp(n) {
    return Math.max(0, Math.min(100, n));
  }

  function barText(m, compact) {
    if (m.value === null) return '未入力';
    var pct = round1(m.percent) + '%';
    if (compact) return pct;
    return m.max === 100 ? pct : digits(m.value) + ' / ' + digits(m.max) + '（' + pct + '）';
  }

  function renderBar(rule, record, compact) {
    var m = measure(rule, record);
    var root = element('div', 'gbi-ind gbi-bar' + (compact ? ' gbi-compact' : ''));
    var track = element('div', 'gbi-track');
    var fill = element('div', 'gbi-fill');
    if (m.value === null) root.classList.add('gbi-empty');
    else fill.style.width = clamp(m.percent) + '%';
    if (m.percent !== null && m.percent >= 100) root.classList.add('gbi-full');
    if (m.behind) root.classList.add('gbi-behind');
    track.appendChild(fill);
    if (m.plan !== null) {
      var mark = element('div', 'gbi-plan-mark');
      mark.style.left = clamp(m.plan) + '%';
      track.appendChild(mark);
    }
    root.appendChild(track);
    var text = barText(m, compact);
    if (m.plan !== null) text += compact ? (m.behind ? ' 遅れ' + m.behind : '') : '　予定 ' + Math.round(clamp(m.plan)) + '%' + (m.behind ? '（' + m.behind + 'ポイント遅れ）' : '');
    root.appendChild(element('span', 'gbi-text', text));
    root.title = barText(m) + (m.plan !== null ? ' / 予定 ' + Math.round(clamp(m.plan)) + '%' : '');
    return root;
  }

  function renderSteps(rule, record, compact) {
    var value = valueOf(record, rule.field);
    var steps = rule.steps || [];
    var at = steps.indexOf(value);
    var root = element('div', 'gbi-ind gbi-steps' + (compact ? ' gbi-compact' : ''));
    var listNode = element('ol', 'gbi-step-list');
    steps.forEach(function(name, i) {
      var state = at < 0 ? 'gbi-todo' : (i < at ? 'gbi-done' : (i === at ? 'gbi-now' : 'gbi-todo'));
      var item = element('li', state, compact ? undefined : name);
      if (compact) item.title = name;
      listNode.appendChild(item);
    });
    root.appendChild(listNode);
    var label;
    if (!value) label = '未入力';
    else if (at < 0) label = compact ? '段階の外' : '段階の外：' + value;
    else label = (at + 1) + ' / ' + steps.length + (compact ? '' : '　' + value);
    if (at < 0 && value) root.classList.add('gbi-outside');
    root.appendChild(element('span', 'gbi-text', label));
    root.title = (at < 0 && value ? value + ' / ' : '') + steps.join(' → ');
    return root;
  }

  function render(rule, record, compact) {
    return rule.kind === 'bar' ? renderBar(rule, record, compact) : renderSteps(rule, record, compact);
  }

  // 画面を開き直したときに二重にならないよう、同じフィールドの表示だけ消す
  function clear(container, code) {
    Array.prototype.slice.call(container.children).forEach(function(child) {
      var mine = code === undefined ? child.classList.contains('gbi-ind') : (child.classList.contains('gbi-detail') && child.getAttribute('data-field') === code);
      if (mine) container.removeChild(child);
    });
  }

  // ---- 一覧 ----
  var current = [];
  var observer = null;

  // 列がバーより細いと切れるので、見出しの幅を広げる。広げられなくても表示は続ける
  function widen(cell) {
    var table = cell.closest('table');
    // kintone の見出しは thead の直下に th が並ぶ（tr がない）
    var head = table && table.tHead && table.tHead.children[cell.cellIndex];
    if (head && head.offsetWidth < MIN_COLUMN) head.style.width = MIN_COLUMN + 'px';
  }

  // 行内編集で kintone がセルを作り直すとバーが消えるので、足りないセルにだけ描き直す
  function paint() {
    rules.forEach(function(rule) {
      var cells = kintone.app.getFieldElements(rule.field);
      if (!cells) return;
      current.forEach(function(record, index) {
        var cell = cells[index];
        if (!cell || !record[rule.field] || cell.querySelector('.gbi-ind,input,select,textarea')) return;
        cell.appendChild(render(rule, record, true));
        if (cell.tagName === 'TD') widen(cell);
      });
    });
  }

  function watch() {
    if (observer) observer.disconnect();
    var found = null;
    rules.forEach(function(rule) {
      var cells = kintone.app.getFieldElements(rule.field);
      if (!found && cells && cells[0]) found = cells[0].closest('table');
    });
    if (!found) return;
    observer = new MutationObserver(paint);
    observer.observe(found, {childList: true, subtree: true});
  }

  kintone.events.on('app.record.index.show', function(event) {
    if (event.viewType !== 'list' || !event.records) return event;
    current = event.records;
    rules.forEach(function(rule) {
      var cells = kintone.app.getFieldElements(rule.field);
      if (cells) event.records.forEach(function(record, index) { if (cells[index]) clear(cells[index]); });
    });
    paint();
    watch();
    return event;
  });

  kintone.events.on('app.record.index.edit.submit.success', function(event) {
    current.forEach(function(record, index) {
      if (record.$id.value !== event.record.$id.value) return;
      current[index] = event.record;
      rules.forEach(function(rule) {
        var cells = kintone.app.getFieldElements(rule.field);
        if (cells && cells[index]) clear(cells[index]);
      });
    });
    paint();
    return event;
  });

  kintone.events.on('app.record.detail.show', function(event) {
    var record = event.record;
    rules.forEach(function(rule) {
      if (!record[rule.field]) return;
      var target = null;
      if (rule.space) target = kintone.app.record.getSpaceElement(rule.space);
      if (!target && record[rule.field].type !== 'STATUS') target = kintone.app.record.getFieldElement(rule.field);
      var top = false;
      if (!target) {
        target = kintone.app.record.getHeaderMenuSpaceElement();
        top = true;
      }
      if (!target) return;
      clear(target, rule.field);
      var box = element('div', 'gbi-detail' + (top ? ' gbi-detail-top' : ''));
      box.setAttribute('data-field', rule.field);
      box.appendChild(render(rule, record, false));
      target.appendChild(box);
    });
    return event;
  });
})(kintone.$PLUGIN_ID);
