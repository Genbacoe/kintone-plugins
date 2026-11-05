(function(PLUGIN_ID) {
  'use strict';

  var NAME_TYPES = ['SINGLE_LINE_TEXT', 'DROP_DOWN', 'RADIO_BUTTON', 'USER_SELECT', 'ORGANIZATION_SELECT', 'GROUP_SELECT'];
  var KINDS = {
    date: {id: 'gbz-date', types: ['DATE'], inTable: false},
    company: {id: 'gbz-company', types: NAME_TYPES, inTable: true},
    amount: {id: 'gbz-amount', types: ['NUMBER', 'CALC'], inTable: true},
    project: {id: 'gbz-project', types: ['SINGLE_LINE_TEXT', 'DROP_DOWN', 'RADIO_BUTTON'], inTable: true}
  };
  var saved = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  var fields = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function addOption(select, value, label) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  // テーブルの中のフィールドも、どのテーブルにあるかを覚えて並べる
  function flatten(properties) {
    var list = [];
    Object.keys(properties).forEach(function(code) {
      var field = properties[code];
      if (field.type === 'SUBTABLE') {
        Object.keys(field.fields || {}).forEach(function(inner) {
          var f = field.fields[inner];
          list.push({code: f.code || inner, label: f.label || inner, type: f.type, table: code, tableLabel: field.label || code});
        });
      } else {
        list.push({code: field.code || code, label: field.label || code, type: field.type, table: ''});
      }
    });
    return list;
  }

  function fill(key) {
    var kind = KINDS[key];
    var select = byId(kind.id);
    addOption(select, '', key === 'project' ? '使わない' : '選んでください');
    fields.forEach(function(f) {
      if (kind.types.indexOf(f.type) < 0) return;
      if (f.table && !kind.inTable) return;
      addOption(select, f.code, (f.table ? f.tableLabel + ' > ' : '') + f.label + '（' + f.code + '）');
    });
    select.value = saved[key] || '';
    if (select.value !== (saved[key] || '')) select.value = '';
  }

  function tableOf(code) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].code === code) return fields[i].table;
    }
    return '';
  }

  byId('gbz-title').value = saved.title || '出面集計表';
  byId('gbz-stamps').value = saved.stamps !== undefined ? saved.stamps : '元請確認,協力会社確認';

  kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: kintone.app.getId()}).then(function(response) {
    fields = flatten(response.properties);
    Object.keys(KINDS).forEach(fill);
  }).catch(function(error) {
    window.alert('フィールドを読み込めませんでした。' + ((error && error.message) || ''));
  });

  function stampList(text) {
    return text.split(/[,、，]/).map(function(s) { return s.trim(); }).filter(Boolean);
  }

  byId('gbz-save').addEventListener('click', function() {
    var config = {};
    Object.keys(KINDS).forEach(function(key) {
      config[key] = byId(KINDS[key].id).value;
    });
    if (!config.date || !config.company || !config.amount) {
      window.alert('日付、協力会社、人工を選んでください。');
      return;
    }
    var table = tableOf(config.amount);
    if (tableOf(config.company) !== table) {
      window.alert('協力会社と人工は、どちらもテーブルの外か、どちらも同じテーブルの中にしてください。');
      return;
    }
    if (config.project && tableOf(config.project) && tableOf(config.project) !== table) {
      window.alert('工事名は、テーブルの外か、人工と同じテーブルの中にしてください。');
      return;
    }
    var stamps = stampList(byId('gbz-stamps').value);
    if (stamps.length > 4) {
      window.alert('確認欄は4つまでです。');
      return;
    }
    config.table = table;
    config.title = byId('gbz-title').value.trim() || '出面集計表';
    config.stamps = stamps.join(',');
    kintone.plugin.app.setConfig(config);
  });

  byId('gbz-cancel').addEventListener('click', function() {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
