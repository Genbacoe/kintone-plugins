(function(PLUGIN_ID) {
  'use strict';

  var RULE_COUNT = 6;
  var MAX_STEPS = 12;
  var BAR_TYPES = ['NUMBER', 'CALC'];
  var STEP_TYPES = ['DROP_DOWN', 'RADIO_BUTTON', 'STATUS'];
  var DATE_TYPES = ['DATE', 'DATETIME'];
  var saved = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  var savedRules = [];
  try {
    savedRules = saved.rules ? JSON.parse(saved.rules) : [];
  } catch (e) {
    savedRules = [];
  }
  if (!Array.isArray(savedRules)) savedRules = [];

  var properties = {};
  var states = [];
  var spaces = [];
  var cards = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addOption(select, value, label) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function fill(select, fields, current, empty) {
    while (select.firstChild) select.removeChild(select.firstChild);
    addOption(select, '', empty);
    fields.forEach(function(field) {
      addOption(select, field.code, field.label + '（' + field.code + '）');
    });
    select.value = current || '';
    if (select.value !== (current || '')) select.value = '';
  }

  function labeled(text, control) {
    var label = element('label', '', text);
    label.appendChild(control);
    return label;
  }

  function list(object) {
    return Object.keys(object || {}).map(function(code) { return object[code]; });
  }

  function ofTypes(types) {
    return list(properties).filter(function(f) { return types.indexOf(f.type) >= 0; });
  }

  // ドロップダウンとラジオボタンは選択肢の並び順、ステータスはプロセス管理の順
  function choicesOf(code) {
    var field = properties[code];
    if (!field) return [];
    if (field.type === 'STATUS') return states.slice();
    return list(field.options).sort(function(a, b) { return Number(a.index) - Number(b.index); }).map(function(o) { return o.label; });
  }

  function kindOf(code) {
    var field = properties[code];
    if (!field) return '';
    if (BAR_TYPES.indexOf(field.type) >= 0) return 'bar';
    if (STEP_TYPES.indexOf(field.type) >= 0) return 'steps';
    return '';
  }

  function buildCard(index, rule) {
    var card = {};
    var box = element('div', 'gbi-rule');
    box.appendChild(element('h3', '', '表示 ' + (index + 1)));

    card.field = element('select', 'gbi-field');
    var targets = ofTypes(BAR_TYPES).concat(ofTypes(STEP_TYPES));
    fill(card.field, targets, rule.field, '使わない');
    box.appendChild(labeled('フィールド', card.field));

    card.bar = element('div', 'gbi-bar-part');
    card.max = element('input', 'gbi-max');
    card.max.type = 'text';
    card.max.inputMode = 'decimal';
    card.max.maxLength = 12;
    card.max.value = rule.max || '100';
    card.bar.appendChild(labeled('満タンの値（進捗率なら100）', card.max));
    card.plan = element('select', 'gbi-plan');
    addOption(card.plan, '', 'くらべない');
    addOption(card.plan, 'field', '予定の数値フィールドとくらべる');
    addOption(card.plan, 'dates', '期間（開始日から終了日）の経過とくらべる');
    card.plan.value = rule.plan === 'field' || rule.plan === 'dates' ? rule.plan : '';
    card.bar.appendChild(labeled('予定とくらべて遅れを出す', card.plan));
    card.planField = element('select', 'gbi-plan-field');
    fill(card.planField, ofTypes(BAR_TYPES), rule.planField, '選んでください');
    card.planFieldLabel = labeled('予定の値のフィールド（満タンの値と同じ単位）', card.planField);
    card.bar.appendChild(card.planFieldLabel);
    card.dates = element('div', 'gbi-two');
    card.start = element('select', 'gbi-start');
    card.end = element('select', 'gbi-end');
    fill(card.start, ofTypes(DATE_TYPES), rule.start, '選んでください');
    fill(card.end, ofTypes(DATE_TYPES), rule.end, '選んでください');
    card.dates.appendChild(labeled('開始日', card.start));
    card.dates.appendChild(labeled('終了日', card.end));
    card.bar.appendChild(card.dates);
    card.bar.appendChild(element('p', 'gbi-note', '期間でくらべると、今日が期間の何%まで進んだかを予定とみなします。休工日は数えに入れません。'));
    box.appendChild(card.bar);

    card.stepsPart = element('div', 'gbi-steps-part');
    card.steps = element('textarea', 'gbi-steps');
    card.steps.rows = 5;
    card.steps.value = (rule.steps || []).join('\n');
    card.stepsPart.appendChild(labeled('段階（1行に1つ、上から順に。' + MAX_STEPS + 'まで）', card.steps));
    card.load = element('button', 'gbi-load', '選択肢から入れる');
    card.load.type = 'button';
    card.load.addEventListener('click', function() {
      card.steps.value = choicesOf(card.field.value).slice(0, MAX_STEPS).join('\n');
    });
    card.stepsPart.appendChild(card.load);
    card.stepsPart.appendChild(element('p', 'gbi-note', '段階にない値（中止など）は、段階の外として表示します。'));
    box.appendChild(card.stepsPart);

    card.space = element('select', 'gbi-space');
    addOption(card.space, '', 'フィールドの下（ステータスは画面の上）');
    spaces.forEach(function(id) {
      addOption(card.space, id, 'スペース：' + id);
    });
    card.space.value = rule.space || '';
    if (card.space.value !== (rule.space || '')) card.space.value = '';
    box.appendChild(labeled('詳細画面での表示場所', card.space));

    function refresh() {
      var kind = kindOf(card.field.value);
      card.bar.classList.toggle('gbi-hidden', kind !== 'bar');
      card.stepsPart.classList.toggle('gbi-hidden', kind !== 'steps');
      card.planFieldLabel.classList.toggle('gbi-hidden', card.plan.value !== 'field');
      card.dates.classList.toggle('gbi-hidden', card.plan.value !== 'dates');
    }
    card.field.addEventListener('change', function() {
      if (kindOf(card.field.value) === 'steps') card.steps.value = choicesOf(card.field.value).slice(0, MAX_STEPS).join('\n');
      refresh();
    });
    card.plan.addEventListener('change', refresh);
    refresh();
    card.box = box;
    return card;
  }

  function spacersOf(layout) {
    var found = [];
    (function walk(rows) {
      (rows || []).forEach(function(row) {
        if (row.type === 'GROUP') walk(row.layout);
        (row.fields || []).forEach(function(f) {
          if (f.type === 'SPACER' && f.elementId) found.push(f.elementId);
        });
      });
    })(layout);
    return found;
  }

  var app = kintone.app.getId();
  Promise.all([
    kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: app}),
    kintone.api(kintone.api.url('/k/v1/app/form/layout.json', true), 'GET', {app: app}),
    kintone.api(kintone.api.url('/k/v1/app/status.json', true), 'GET', {app: app}).catch(function() { return {}; })
  ]).then(function(results) {
    properties = results[0].properties || {};
    spaces = spacersOf(results[1].layout);
    var status = results[2] || {};
    var enabled = status.enable === true || status.enable === 'true';
    states = enabled ? list(status.states).sort(function(a, b) { return Number(a.index) - Number(b.index); }).map(function(s) { return s.name; }) : [];
    if (!enabled) {
      Object.keys(properties).forEach(function(code) {
        if (properties[code].type === 'STATUS') delete properties[code];
      });
    }
    var root = byId('gbi-rules');
    for (var i = 0; i < RULE_COUNT; i++) {
      var card = buildCard(i, savedRules[i] || {});
      cards.push(card);
      root.appendChild(card.box);
    }
  }).catch(function(error) {
    window.alert('フィールドを読み込めませんでした。' + ((error && error.message) || ''));
  });

  function fail(message) {
    window.alert(message);
    return null;
  }

  function readCard(card, number) {
    var code = card.field.value;
    if (!code) return undefined;
    var kind = kindOf(code);
    var rule = {field: code, kind: kind, space: card.space.value};
    var where = '表示 ' + number + '：';
    if (kind === 'bar') {
      var max = card.max.value.trim();
      if (!/^\d+(\.\d+)?$/.test(max) || !(Number(max) > 0)) return fail(where + '満タンの値は0より大きい数で入れてください。');
      rule.max = max;
      rule.plan = card.plan.value;
      if (rule.plan === 'field') {
        if (!card.planField.value) return fail(where + '予定の値のフィールドを選んでください。');
        if (card.planField.value === code) return fail(where + '予定の値は、表示するフィールドと別のものを選んでください。');
        rule.planField = card.planField.value;
      }
      if (rule.plan === 'dates') {
        if (!card.start.value || !card.end.value) return fail(where + '開始日と終了日を選んでください。');
        if (card.start.value === card.end.value) return fail(where + '開始日と終了日は別のフィールドを選んでください。');
        rule.start = card.start.value;
        rule.end = card.end.value;
      }
    } else {
      var steps = card.steps.value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
      if (steps.length < 2) return fail(where + '段階を2つ以上入れてください。');
      if (steps.length > MAX_STEPS) return fail(where + '段階は' + MAX_STEPS + 'までです。');
      if (steps.some(function(s, i) { return steps.indexOf(s) !== i; })) return fail(where + '同じ段階が2回あります。');
      if (steps.some(function(s) { return s.length > 30; })) return fail(where + '段階の名前は30文字までです。');
      rule.steps = steps;
    }
    return rule;
  }

  byId('gbi-save').addEventListener('click', function() {
    var rules = [];
    var used = {};
    for (var i = 0; i < cards.length; i++) {
      var rule = readCard(cards[i], i + 1);
      if (rule === null) return;
      if (rule === undefined) continue;
      if (used[rule.field]) {
        window.alert('同じフィールドが2回選ばれています。');
        return;
      }
      used[rule.field] = true;
      rules.push(rule);
    }
    if (!rules.length) {
      window.alert('フィールドを1つ以上選んでください。');
      return;
    }
    kintone.plugin.app.setConfig({rules: JSON.stringify(rules)});
  });

  byId('gbi-cancel').addEventListener('click', function() {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
