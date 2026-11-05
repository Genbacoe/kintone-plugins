(function(PLUGIN_ID) {
  'use strict';

  var NAME_TYPES = ['SINGLE_LINE_TEXT', 'DROP_DOWN', 'RADIO_BUTTON', 'USER_SELECT', 'ORGANIZATION_SELECT', 'GROUP_SELECT'];
  var KINDS = {
    task: {id: 'gbg-task', types: ['SINGLE_LINE_TEXT', 'DROP_DOWN', 'RADIO_BUTTON', 'RECORD_NUMBER'], required: true},
    start: {id: 'gbg-start', types: ['DATE'], required: true},
    end: {id: 'gbg-end', types: ['DATE'], required: true},
    project: {id: 'gbg-project', types: ['SINGLE_LINE_TEXT', 'DROP_DOWN', 'RADIO_BUTTON']},
    company: {id: 'gbg-company', types: NAME_TYPES},
    progress: {id: 'gbg-progress', types: ['NUMBER', 'CALC']},
    actualStart: {id: 'gbg-actual-start', types: ['DATE']},
    actualEnd: {id: 'gbg-actual-end', types: ['DATE']}
  };
  var saved = kintone.plugin.app.getConfig(PLUGIN_ID) || {};

  function byId(id) {
    return document.getElementById(id);
  }

  function addOption(select, value, label) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function fill(key, fields) {
    var kind = KINDS[key];
    var select = byId(kind.id);
    addOption(select, '', kind.required ? '選んでください' : '使わない');
    fields.forEach(function(f) {
      if (kind.types.indexOf(f.type) >= 0) addOption(select, f.code, f.label + '（' + f.code + '）');
    });
    select.value = saved[key] || '';
    if (select.value !== (saved[key] || '')) select.value = '';
  }

  byId('gbg-title').value = saved.title || '工程表';
  byId('gbg-paper').value = saved.paper === 'a4' ? 'a4' : 'a3';

  kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: kintone.app.getId()}).then(function(response) {
    // テーブルの中のフィールドは properties の直下に出てこないので、ここには並ばない
    var fields = Object.keys(response.properties).map(function(code) { return response.properties[code]; });
    Object.keys(KINDS).forEach(function(key) {
      fill(key, fields);
    });
  }).catch(function(error) {
    window.alert('フィールドを読み込めませんでした。' + ((error && error.message) || ''));
  });

  byId('gbg-save').addEventListener('click', function() {
    var config = {};
    Object.keys(KINDS).forEach(function(key) {
      config[key] = byId(KINDS[key].id).value;
    });
    if (!config.task || !config.start || !config.end) {
      window.alert('作業名、開始日、終了日を選んでください。');
      return;
    }
    if (config.start === config.end) {
      window.alert('開始日と終了日には、別のフィールドを選んでください。');
      return;
    }
    if (config.actualEnd && !config.actualStart) {
      window.alert('実績の終了日を使うときは、実績の開始日も選んでください。');
      return;
    }
    config.title = byId('gbg-title').value.trim() || '工程表';
    config.paper = byId('gbg-paper').value;
    kintone.plugin.app.setConfig(config);
  });

  byId('gbg-cancel').addEventListener('click', function() {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
