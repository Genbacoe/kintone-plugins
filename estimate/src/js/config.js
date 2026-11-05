(function(PLUGIN_ID) {
  'use strict';

  var ROW_IDS = {name: 'gbe-name', spec: 'gbe-spec', qty: 'gbe-qty', unit: 'gbe-unit', price: 'gbe-price', amount: 'gbe-amount', remark: 'gbe-remark'};
  var TOP_IDS = {
    rateField: 'gbe-rate-field', welfare: 'gbe-welfare', discount: 'gbe-discount',
    outSub: 'gbe-out-sub', outExp: 'gbe-out-exp', outBase: 'gbe-out-base', outTax: 'gbe-out-tax', outTotal: 'gbe-out-total',
    to: 'gbe-to', project: 'gbe-project', place: 'gbe-place', term: 'gbe-term', no: 'gbe-no', date: 'gbe-date', limit: 'gbe-limit', pay: 'gbe-pay', note: 'gbe-note'
  };
  var OUTPUTS = ['outSub', 'outExp', 'outBase', 'outTax', 'outTotal'];
  var TEXT_TYPES = ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT', 'NUMBER', 'CALC', 'LINK', 'DATE', 'TIME', 'DATETIME',
    'DROP_DOWN', 'RADIO_BUTTON', 'CHECK_BOX', 'MULTI_SELECT', 'USER_SELECT', 'ORGANIZATION_SELECT', 'GROUP_SELECT',
    'RECORD_NUMBER', 'CREATOR', 'MODIFIER', 'CREATED_TIME', 'UPDATED_TIME'];
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

  function fillRows(current) {
    var table = properties[byId('gbe-table').value];
    var inner = table ? list(table.fields) : [];
    Object.keys(ROW_IDS).forEach(function(key) {
      var select = byId(ROW_IDS[key]);
      var required = key === 'name' || key === 'qty' || key === 'price';
      fill(select, inner.filter(KINDS[select.getAttribute('data-row')]), current[key], required ? '選んでください' : '使わない');
    });
  }

  kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: kintone.app.getId()}).then(function(response) {
    properties = response.properties || {};
    var top = list(properties);
    fill(byId('gbe-table'), top.filter(function(f) { return f.type === 'SUBTABLE'; }), saved.table, '選んでください');
    fillRows(saved);
    Object.keys(TOP_IDS).forEach(function(key) {
      var select = byId(TOP_IDS[key]);
      fill(select, top.filter(KINDS[select.getAttribute('data-top')]), saved[key]);
    });
    byId('gbe-table').addEventListener('change', function() {
      fillRows({});
    });
  }).catch(function(error) {
    window.alert('フィールドを読み込めませんでした。' + ((error && error.message) || ''));
  });

  byId('gbe-rate').value = saved.rate || '';
  byId('gbe-title').value = saved.title || '';
  byId('gbe-company').value = saved.company || '';
  byId('gbe-stamps').value = saved.stamps || '';

  function stampList(text) {
    return text.split(/[,、，]/).map(function(s) { return s.trim(); }).filter(Boolean);
  }

  byId('gbe-save').addEventListener('click', function() {
    var config = {table: byId('gbe-table').value};
    Object.keys(ROW_IDS).forEach(function(key) {
      config[key] = byId(ROW_IDS[key]).value;
    });
    Object.keys(TOP_IDS).forEach(function(key) {
      config[key] = byId(TOP_IDS[key]).value;
    });
    if (!config.table || !config.name || !config.qty || !config.price) {
      window.alert('明細のテーブル、品名、数量、単価を選んでください。');
      return;
    }
    if (config.qty === config.price || (config.amount && (config.amount === config.qty || config.amount === config.price))) {
      window.alert('数量、単価、金額の書き込み先は、別々のフィールドを選んでください。');
      return;
    }
    var rate = byId('gbe-rate').value.trim();
    if (rate && !/^\d{1,3}(\.\d{1,3})?$/.test(rate)) {
      window.alert('諸経費率は、0から999までの数で入れてください（小数は3桁まで）。');
      return;
    }
    var used = {};
    var inputs = [config.rateField, config.welfare, config.discount].filter(Boolean);
    var clash = OUTPUTS.some(function(key) {
      var code = config[key];
      if (!code) return false;
      if (used[code] || inputs.indexOf(code) >= 0) return true;
      used[code] = true;
      return false;
    });
    if (clash) {
      window.alert('計算結果の書き込み先は、それぞれ別のフィールドで、諸経費率、法定福利費、値引きとも別にしてください。');
      return;
    }
    var stamps = stampList(byId('gbe-stamps').value);
    if (stamps.length > 4) {
      window.alert('検印欄は4つまでです。');
      return;
    }
    config.rate = rate;
    config.title = byId('gbe-title').value.trim();
    config.company = byId('gbe-company').value.replace(/\s+$/, '');
    config.stamps = stamps.join(',');
    kintone.plugin.app.setConfig(config);
  });

  byId('gbe-cancel').addEventListener('click', function() {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
