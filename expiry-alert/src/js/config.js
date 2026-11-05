(function(PLUGIN_ID) {
  'use strict';

  var saved = kintone.plugin.app.getConfig(PLUGIN_ID);
  var chosen = saved.fields ? JSON.parse(saved.fields) : [];
  var box = document.getElementById('gbk-fields');
  var days = document.getElementById('gbk-days');
  days.value = saved.days || '30';

  kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: kintone.app.getId()}).then(function(response) {
    var found = 0;
    Object.keys(response.properties).forEach(function(code) {
      var field = response.properties[code];
      if (field.type !== 'DATE' && field.type !== 'DATETIME') return;
      found++;
      var label = document.createElement('label');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = code;
      input.checked = chosen.indexOf(code) >= 0;
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + field.label + '（' + code + '）'));
      box.appendChild(label);
    });
    if (!found) box.textContent = 'このアプリには、サブテーブルの外に日付フィールドがありません。';
  });

  document.getElementById('gbk-save').addEventListener('click', function() {
    var fields = Array.prototype.map.call(box.querySelectorAll('input:checked'), function(i) { return i.value; });
    var limit = Number(days.value);
    if (!fields.length) {
      window.alert('日付フィールドを1つ以上選んでください。');
      return;
    }
    if (!(limit >= 1 && limit <= 365)) {
      window.alert('日数は1から365で入れてください。');
      return;
    }
    kintone.plugin.app.setConfig({fields: JSON.stringify(fields), days: String(Math.floor(limit))});
  });

  document.getElementById('gbk-cancel').addEventListener('click', function() {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
