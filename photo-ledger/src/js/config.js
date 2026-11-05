(function(PLUGIN_ID) {
  'use strict';

  var TEXT_IDS = {project: 'gbk-project', date: 'gbk-date', work: 'gbk-work', place: 'gbk-place', note: 'gbk-note'};
  var TEXT_TYPES = ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'DATE', 'DATETIME', 'DROP_DOWN', 'RADIO_BUTTON', 'CHECK_BOX',
    'MULTI_SELECT', 'NUMBER', 'CALC', 'LINK', 'USER_SELECT', 'ORGANIZATION_SELECT', 'CREATOR', 'MODIFIER', 'CREATED_TIME', 'UPDATED_TIME'];
  var saved = kintone.plugin.app.getConfig(PLUGIN_ID);

  function byId(id) {
    return document.getElementById(id);
  }

  function addOption(select, value, label, current) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === (current || '');
    select.appendChild(option);
  }

  function fill(select, fields, current, empty) {
    addOption(select, '', empty, current);
    fields.forEach(function(field) {
      addOption(select, field.code, field.label + '（' + field.code + '）', current);
    });
  }

  function flatten(properties) {
    var list = [];
    Object.keys(properties).forEach(function(code) {
      var field = properties[code];
      if (field.type === 'SUBTABLE') {
        Object.keys(field.fields).forEach(function(inner) {
          list.push(field.fields[inner]);
        });
      } else {
        list.push(field);
      }
    });
    return list;
  }

  kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: kintone.app.getId()}).then(function(response) {
    var fields = flatten(response.properties);
    fill(byId('gbk-photo'), fields.filter(function(f) { return f.type === 'FILE'; }), saved.photo, '選んでください');
    var texts = fields.filter(function(f) { return TEXT_TYPES.indexOf(f.type) >= 0; });
    Object.keys(TEXT_IDS).forEach(function(key) {
      fill(byId(TEXT_IDS[key]), texts, saved[key], '使わない');
    });
    byId('gbk-per-page').value = saved.perPage || '3';
  });

  byId('gbk-save').addEventListener('click', function() {
    var photo = byId('gbk-photo').value;
    if (!photo) {
      window.alert('写真のフィールドを選んでください。');
      return;
    }
    var config = {photo: photo, perPage: byId('gbk-per-page').value};
    Object.keys(TEXT_IDS).forEach(function(key) {
      config[key] = byId(TEXT_IDS[key]).value;
    });
    kintone.plugin.app.setConfig(config);
  });

  byId('gbk-cancel').addEventListener('click', function() {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
