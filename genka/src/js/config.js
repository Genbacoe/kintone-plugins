(function(PLUGIN_ID) {
  'use strict';

  var TABLE_ROWS = {item: 'gbc-item', budget: 'gbc-budget', rowDiff: 'gbc-row-diff', rowRate: 'gbc-row-rate'};
  var ACTUAL_ROWS = {actualItem: 'gbc-actual-item', actual: 'gbc-actual'};
  var TOP_IDS = {
    outBudget: 'gbc-out-budget', outActual: 'gbc-out-actual', outDiff: 'gbc-out-diff', outRate: 'gbc-out-rate',
    contract: 'gbc-contract', project: 'gbc-project', no: 'gbc-no', client: 'gbc-client', term: 'gbc-term', person: 'gbc-person'
  };
  var REQUIRED = {item: true, budget: true, actual: true};
  var OUTPUTS = ['outBudget', 'outActual', 'outDiff', 'outRate'];
  var TEXT_TYPES = ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'NUMBER', 'CALC', 'LINK', 'DATE', 'DATETIME',
    'DROP_DOWN', 'RADIO_BUTTON', 'CHECK_BOX', 'MULTI_SELECT', 'USER_SELECT', 'ORGANIZATION_SELECT', 'GROUP_SELECT',
    'RECORD_NUMBER', 'CREATOR', 'MODIFIER'];
  var KINDS = {
    text: function(f) { return TEXT_TYPES.indexOf(f.type) >= 0; },
    number: function(f) { return f.type === 'NUMBER' || f.type === 'CALC'; },
    output: function(f) { return f.type === 'NUMBER'; }
  };
  var saved = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  var properties = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function addOption(select, value, label) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function fill(select, fields, current, empty) {
    while (select.firstChild) select.removeChild(select.firstChild);
    addOption(select, '', empty || '使わない');
    fields.forEach(function(field) {
      addOption(select, field.code, field.label + '（' + field.code + '）');
    });
    select.value = current || '';
    if (select.value !== (current || '')) select.value = '';
  }

  function list(object) {
    return Object.keys(object || {}).map(function(code) { return object[code]; });
  }

  function inner(code) {
    var table = properties[code];
    return table && table.type === 'SUBTABLE' ? list(table.fields) : [];
  }

  function fillRows(ids, fields, current) {
    Object.keys(ids).forEach(function(key) {
      var select = byId(ids[key]);
      fill(select, fields.filter(KINDS[select.getAttribute('data-kind')]), current[key], REQUIRED[key] ? '選んでください' : '使わない');
    });
  }

  function actualTableCode() {
    return byId('gbc-actual-table').value || byId('gbc-table').value;
  }

  function refreshActual(current) {
    fillRows(ACTUAL_ROWS, inner(actualTableCode()), current);
    var separate = !!byId('gbc-actual-table').value;
    byId('gbc-actual-item').disabled = !separate;
    if (!separate) byId('gbc-actual-item').value = '';
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
    kintone.api(kintone.api.url('/k/v1/app/form/layout.json', true), 'GET', {app: app}).catch(function() { return {layout: []}; })
  ]).then(function(results) {
    properties = results[0].properties || {};
    var top = list(properties);
    var tables = top.filter(function(f) { return f.type === 'SUBTABLE'; });
    fill(byId('gbc-table'), tables, saved.table, '選んでください');
    fill(byId('gbc-actual-table'), tables, saved.actualTable, '実行予算と同じテーブル');
    fillRows(TABLE_ROWS, inner(saved.table), saved);
    refreshActual(saved);
    Object.keys(TOP_IDS).forEach(function(key) {
      var select = byId(TOP_IDS[key]);
      fill(select, top.filter(KINDS[select.getAttribute('data-top')]), saved[key]);
    });
    var spaces = spacersOf(results[1].layout).map(function(id) { return {code: id, label: 'スペース'}; });
    fill(byId('gbc-space'), spaces, saved.space, '使わない（ボタンだけ）');
    byId('gbc-table').addEventListener('change', function() {
      fillRows(TABLE_ROWS, inner(byId('gbc-table').value), {});
      refreshActual({});
    });
    byId('gbc-actual-table').addEventListener('change', function() {
      refreshActual({});
    });
  }).catch(function(error) {
    window.alert('フィールドを読み込めませんでした。' + ((error && error.message) || ''));
  });

  byId('gbc-warn').value = saved.warn || '';
  byId('gbc-title').value = saved.title || '';
  byId('gbc-company').value = saved.company || '';
  byId('gbc-stamps').value = saved.stamps || '';

  function stampList(text) {
    return text.split(/[,、，]/).map(function(s) { return s.trim(); }).filter(Boolean);
  }

  function fail(message) {
    window.alert(message);
  }

  byId('gbc-save').addEventListener('click', function() {
    var config = {table: byId('gbc-table').value, actualTable: byId('gbc-actual-table').value, space: byId('gbc-space').value};
    [TABLE_ROWS, ACTUAL_ROWS, TOP_IDS].forEach(function(ids) {
      Object.keys(ids).forEach(function(key) {
        config[key] = byId(ids[key]).value;
      });
    });
    if (config.actualTable === config.table) config.actualTable = '';
    if (!config.actualTable) config.actualItem = '';
    if (!config.table || !config.item || !config.budget || !config.actual) {
      fail('実行予算のテーブル、費目、実行予算の金額、実績の金額を選んでください。');
      return;
    }
    if (config.actualTable && !config.actualItem) {
      fail('実績を別のテーブルにするときは、実績の費目も選んでください。');
      return;
    }
    var same = !config.actualTable;
    if (!same && (config.rowDiff || config.rowRate)) {
      fail('行ごとの差額と消化率は、実績が実行予算と同じテーブルのときだけ使えます。');
      return;
    }
    var rowCodes = [config.budget, same ? config.actual : '', config.rowDiff, config.rowRate].filter(Boolean);
    if (rowCodes.some(function(code, index) { return rowCodes.indexOf(code) !== index; })) {
      fail('実行予算、実績、行ごとの差額、行ごとの消化率は、別々のフィールドを選んでください。');
      return;
    }
    var tops = OUTPUTS.map(function(key) { return config[key]; }).filter(Boolean);
    if (tops.some(function(code, index) { return tops.indexOf(code) !== index; }) || (config.contract && tops.indexOf(config.contract) >= 0)) {
      fail('計算結果の書き込み先は、それぞれ別のフィールドで、請負金額とも別にしてください。');
      return;
    }
    var warn = byId('gbc-warn').value.trim();
    if (warn && !(/^\d{1,3}(\.\d)?$/.test(warn) && Number(warn) > 0)) {
      fail('黄色にする消化率は、1から999までの数で入れてください（小数は1桁まで）。');
      return;
    }
    var stamps = stampList(byId('gbc-stamps').value);
    if (stamps.length > 4) {
      fail('検印欄は4つまでです。');
      return;
    }
    config.warn = warn;
    config.title = byId('gbc-title').value.trim();
    config.company = byId('gbc-company').value.replace(/\s+$/, '');
    config.stamps = stamps.join(',');
    kintone.plugin.app.setConfig(config);
  });

  byId('gbc-cancel').addEventListener('click', function() {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
