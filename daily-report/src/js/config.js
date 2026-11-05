(function(PLUGIN_ID) {
  'use strict';

  var ROW_COUNT = 12;
  var HEAD_IDS = {date: 'gbd-date', project: 'gbd-project', place: 'gbd-place', weather: 'gbd-weather', author: 'gbd-author'};
  // 1つの値として印刷できる型。サブテーブルは本文の項目だけで選べる
  var VALUE_TYPES = ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT', 'NUMBER', 'CALC', 'LINK', 'DATE', 'TIME', 'DATETIME',
    'DROP_DOWN', 'RADIO_BUTTON', 'CHECK_BOX', 'MULTI_SELECT', 'USER_SELECT', 'ORGANIZATION_SELECT', 'GROUP_SELECT', 'FILE',
    'RECORD_NUMBER', 'CREATOR', 'MODIFIER', 'CREATED_TIME', 'UPDATED_TIME', 'STATUS', 'STATUS_ASSIGNEE', 'CATEGORY'];
  var KINDS = {
    daily: {title: '作業日報', stamps: '作成,確認,承認', signs: '0', signLabel: '署名'},
    ky: {title: 'KY活動記録', stamps: '職長,確認', signs: '12', signLabel: '参加者の署名'},
    free: {title: '記録', stamps: '', signs: '0', signLabel: '署名'}
  };
  var HINTS = {
    daily: ['作業内容', '作業員', '使用機械', '明日の予定', '特記事項'],
    ky: ['作業内容', '危険のポイント', '対策', '行動目標'],
    free: []
  };
  var saved = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  var savedRows = [];
  try {
    savedRows = saved.rows ? JSON.parse(saved.rows) : [];
  } catch (e) {
    savedRows = [];
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function addOption(select, value, label) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function fill(select, fields, current) {
    addOption(select, '', '使わない');
    fields.forEach(function(field) {
      addOption(select, field.code, field.label + '（' + field.code + '）' + (field.type === 'SUBTABLE' ? ' 表' : ''));
    });
    select.value = current || '';
    if (select.value !== (current || '')) select.value = '';
  }

  function applyKind(kind) {
    var preset = KINDS[kind] || KINDS.free;
    byId('gbd-title').value = preset.title;
    byId('gbd-stamps').value = preset.stamps;
    byId('gbd-signs').value = preset.signs;
    byId('gbd-sign-label').value = preset.signLabel;
    hint(kind);
  }

  function hint(kind) {
    var hints = HINTS[kind] || [];
    Array.prototype.forEach.call(byId('gbd-rows').querySelectorAll('input'), function(input, index) {
      input.placeholder = hints[index] || '見出し（空欄でフィールド名）';
    });
  }

  function buildRows(fields) {
    var box = byId('gbd-rows');
    for (var i = 0; i < ROW_COUNT; i++) {
      var row = document.createElement('div');
      row.className = 'gbd-row';
      var number = document.createElement('span');
      number.textContent = String(i + 1);
      var select = document.createElement('select');
      var input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 30;
      var current = savedRows[i] || {};
      fill(select, fields, current.code);
      input.value = current.label || '';
      row.appendChild(number);
      row.appendChild(select);
      row.appendChild(input);
      box.appendChild(row);
    }
  }

  var kind = byId('gbd-kind');
  kind.value = KINDS[saved.kind] ? saved.kind : 'daily';
  if (savedRows.length) {
    byId('gbd-title').value = saved.title || '';
    byId('gbd-stamps').value = saved.stamps || '';
    byId('gbd-signs').value = saved.signs || '0';
    byId('gbd-sign-label').value = saved.signLabel || '';
  } else {
    applyKind(kind.value);
  }
  kind.addEventListener('change', function() {
    applyKind(kind.value);
  });

  kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: kintone.app.getId()}).then(function(response) {
    var all = Object.keys(response.properties).map(function(code) { return response.properties[code]; });
    var values = all.filter(function(f) { return VALUE_TYPES.indexOf(f.type) >= 0; });
    var body = all.filter(function(f) { return VALUE_TYPES.indexOf(f.type) >= 0 || f.type === 'SUBTABLE'; });
    Object.keys(HEAD_IDS).forEach(function(key) {
      fill(byId(HEAD_IDS[key]), values, saved[key]);
    });
    buildRows(body);
    hint(kind.value);
  }).catch(function(error) {
    window.alert('フィールドを読み込めませんでした。' + ((error && error.message) || ''));
  });

  function stampList(text) {
    return text.split(/[,、，]/).map(function(s) { return s.trim(); }).filter(Boolean);
  }

  byId('gbd-save').addEventListener('click', function() {
    var rows = [];
    Array.prototype.forEach.call(byId('gbd-rows').querySelectorAll('.gbd-row'), function(row) {
      var code = row.querySelector('select').value;
      if (code) rows.push({code: code, label: row.querySelector('input').value.trim()});
    });
    if (!rows.length) {
      window.alert('本文の項目を1つ以上選んでください。');
      return;
    }
    var stamps = stampList(byId('gbd-stamps').value);
    if (stamps.length > 5) {
      window.alert('検印欄は5つまでです。');
      return;
    }
    var signs = Number(byId('gbd-signs').value || 0);
    if (!(signs >= 0 && signs <= 30) || Math.floor(signs) !== signs) {
      window.alert('署名欄の数は0から30の整数で入れてください。');
      return;
    }
    var config = {
      kind: kind.value,
      title: byId('gbd-title').value.trim() || (KINDS[kind.value] || KINDS.free).title,
      rows: JSON.stringify(rows),
      stamps: stamps.join(','),
      signs: String(signs),
      signLabel: byId('gbd-sign-label').value.trim()
    };
    Object.keys(HEAD_IDS).forEach(function(key) {
      config[key] = byId(HEAD_IDS[key]).value;
    });
    kintone.plugin.app.setConfig(config);
  });

  byId('gbd-cancel').addEventListener('click', function() {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
