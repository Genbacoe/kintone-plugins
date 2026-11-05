(function(PLUGIN_ID) {
  'use strict';

  var config = kintone.plugin.app.getConfig(PLUGIN_ID);
  if (!config.fields) return;
  var fields = JSON.parse(config.fields);
  var limit = Number(config.days) || 30;
  var DAY = 86400000;

  function startOfToday() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  // 残り日数。日付だけの値は端末の暦のその日として数える
  function daysLeft(value) {
    if (!value) return null;
    var date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value);
    var time = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    if (isNaN(time)) return null;
    return Math.round((time - startOfToday()) / DAY);
  }

  function mark(cell, left) {
    if (!cell || left === null || left > limit) return 0;
    var expired = left < 0;
    cell.classList.add(expired ? 'gbk-expired' : 'gbk-soon');
    var tag = document.createElement('span');
    tag.className = 'gbk-tag';
    tag.textContent = expired ? (-left) + '日超過' : (left === 0 ? '今日まで' : 'あと' + left + '日');
    cell.appendChild(tag);
    return expired ? 1 : 2;
  }

  kintone.events.on('app.record.index.show', function(event) {
    if (event.viewType !== 'list') return event;
    var expired = 0;
    var soon = 0;
    fields.forEach(function(code) {
      var cells = kintone.app.getFieldElements(code);
      if (!cells) return;
      event.records.forEach(function(record, index) {
        if (!record[code]) return;
        var state = mark(cells[index], daysLeft(record[code].value));
        if (state === 1) expired++;
        if (state === 2) soon++;
      });
    });
    var space = kintone.app.getHeaderMenuSpaceElement();
    var old = document.getElementById('gbk-summary');
    if (old) old.parentNode.removeChild(old);
    if (space) {
      var note = document.createElement('span');
      note.id = 'gbk-summary';
      note.className = 'gbk-summary';
      note.textContent = 'この画面の表示分：期限切れ ' + expired + '件 ／ ' + limit + '日以内 ' + soon + '件';
      space.appendChild(note);
    }
    return event;
  });

  kintone.events.on('app.record.detail.show', function(event) {
    fields.forEach(function(code) {
      if (event.record[code]) mark(kintone.app.record.getFieldElement(code), daysLeft(event.record[code].value));
    });
    return event;
  });
})(kintone.$PLUGIN_ID);
