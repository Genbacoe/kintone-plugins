(function(PLUGIN_ID) {
  'use strict';

  var MAX_RECORDS = 100;
  var FETCH_LIMIT = 500;
  var HEAD = [['date', '日付'], ['project', '工事名'], ['place', '場所'], ['weather', '天候'], ['author', '作成者']];
  var BLOCKS = {P: 1, DIV: 1, LI: 1, TR: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, PRE: 1};
  var config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  var rows = [];
  try {
    rows = config.rows ? JSON.parse(config.rows) : [];
  } catch (e) {
    rows = [];
  }
  if (!rows.length) return;
  var title = config.title || '作業日報';
  var stamps = (config.stamps || '').split(',').filter(Boolean).slice(0, 5);
  var signs = Math.min(Math.max(Number(config.signs) || 0, 0), 30);

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // 日時はUTCで届くので、端末の時刻に直して「2026-11-02 08:30」にする
  function localTime(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  // リッチエディターのHTMLは、描画しない文書で読んで文字だけ取り出す
  function richText(html) {
    var doc = new DOMParser().parseFromString(String(html), 'text/html');
    var out = '';
    (function walk(node) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) {
          out += child.nodeValue;
        } else if (child.nodeType === 1) {
          if (child.nodeName === 'BR') {
            out += '\n';
          } else if (child.nodeName !== 'SCRIPT' && child.nodeName !== 'STYLE') {
            walk(child);
            if (BLOCKS[child.nodeName] && out.slice(-1) !== '\n') out += '\n';
          }
        }
      }
    })(doc.body);
    return out.replace(/\n+$/, '');
  }

  function withDigits(value) {
    var parts = String(value).split('.');
    if (!/^-?\d+$/.test(parts[0])) return String(value);
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function display(field, property) {
    if (!field || field.value === null || field.value === undefined || field.value === '') return '';
    var value = field.value;
    var prop = property || {};
    switch (field.type) {
      case 'DATETIME':
      case 'CREATED_TIME':
      case 'UPDATED_TIME':
        return localTime(value);
      case 'RICH_TEXT':
        return richText(value);
      case 'NUMBER':
      case 'CALC':
        if (field.type === 'CALC' && prop.format && prop.format !== 'NUMBER' && prop.format !== 'NUMBER_DIGIT') return String(value);
        var number = (prop.digit === true || prop.digit === 'true' || prop.format === 'NUMBER_DIGIT') ? withDigits(value) : String(value);
        if (!prop.unit) return number;
        return prop.unitPosition === 'BEFORE' ? prop.unit + number : number + prop.unit;
      default:
        break;
    }
    if (Array.isArray(value)) return value.map(function(v) { return (v && typeof v === 'object') ? (v.name || v.code || '') : String(v); }).join('、');
    if (typeof value === 'object') return value.name || value.code || '';
    return String(value);
  }

  function propertyOf(properties, code) {
    return (properties && properties[code]) || {};
  }

  function labelOf(row, properties) {
    return row.label || propertyOf(properties, row.code).label || row.code;
  }

  function renderTable(field, property) {
    var inner = property.fields || {};
    var codes = Object.keys(inner);
    if (!codes.length && field.value.length) codes = Object.keys(field.value[0].value);
    var table = element('table', 'gbd-sub');
    var head = element('thead');
    var headRow = element('tr');
    codes.forEach(function(code) {
      headRow.appendChild(element('th', '', (inner[code] && inner[code].label) || code));
    });
    head.appendChild(headRow);
    table.appendChild(head);
    var body = element('tbody');
    field.value.forEach(function(line) {
      var tr = element('tr');
      codes.forEach(function(code) {
        tr.appendChild(element('td', '', display(line.value[code], inner[code])));
      });
      body.appendChild(tr);
    });
    if (!field.value.length) {
      var empty = element('tr');
      var cell = element('td', '', ' ');
      cell.colSpan = Math.max(codes.length, 1);
      empty.appendChild(cell);
      body.appendChild(empty);
    }
    table.appendChild(body);
    return table;
  }

  function renderSheet(record, properties, index, total) {
    var sheet = element('section', 'gbd-sheet');
    var inner = element('div', 'gbd-inner');
    sheet.appendChild(inner);

    var top = element('div', 'gbd-top');
    top.appendChild(element('h1', 'gbd-title', title));
    if (stamps.length) {
      var stampBox = element('table', 'gbd-stamps');
      var labels = element('tr');
      var boxes = element('tr');
      stamps.forEach(function(name) {
        labels.appendChild(element('th', '', name));
        boxes.appendChild(element('td', '', ' '));
      });
      stampBox.appendChild(labels);
      stampBox.appendChild(boxes);
      top.appendChild(stampBox);
    }
    inner.appendChild(top);

    var heads = HEAD.filter(function(h) { return config[h[0]]; });
    if (heads.length) {
      var meta = element('dl', 'gbd-meta');
      heads.forEach(function(h) {
        var item = element('div');
        item.appendChild(element('dt', '', h[1]));
        item.appendChild(element('dd', '', display(record[config[h[0]]], propertyOf(properties, config[h[0]])) || ' '));
        meta.appendChild(item);
      });
      inner.appendChild(meta);
    }

    var table = element('table', 'gbd-body');
    var tbody = element('tbody');
    table.appendChild(tbody);
    rows.forEach(function(row) {
      var field = record[row.code];
      var tr = element('tr');
      tr.appendChild(element('th', '', labelOf(row, properties)));
      var td = element('td');
      if (field && field.type === 'SUBTABLE') {
        td.className = 'gbd-has-sub';
        td.appendChild(renderTable(field, propertyOf(properties, row.code)));
      } else {
        td.textContent = display(field, propertyOf(properties, row.code)) || ' ';
      }
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    inner.appendChild(table);

    if (signs) {
      var signBlock = element('div', 'gbd-signs');
      signBlock.appendChild(element('p', 'gbd-sign-label', config.signLabel || '署名'));
      var grid = element('div', 'gbd-sign-grid');
      for (var i = 0; i < signs; i++) grid.appendChild(element('div', 'gbd-sign', ' '));
      signBlock.appendChild(grid);
      inner.appendChild(signBlock);
    }

    var foot = element('div', 'gbd-foot');
    foot.appendChild(element('span', '', record.$id ? 'レコード番号 ' + record.$id.value : ''));
    foot.appendChild(element('span', '', (index + 1) + ' / ' + total));
    inner.appendChild(foot);
    return sheet;
  }

  function close() {
    var root = document.getElementById('gbd-report');
    if (root) root.parentNode.removeChild(root);
    document.body.classList.remove('gbd-printing');
  }

  function open(records, properties, notes) {
    close();
    var root = element('div');
    root.id = 'gbd-report';
    var bar = element('div', 'gbd-bar');
    var print = element('button', 'gbd-print', '印刷');
    var shut = element('button', '', '閉じる');
    var status = element('span', 'gbd-status');
    print.type = shut.type = 'button';
    bar.appendChild(print);
    bar.appendChild(shut);
    bar.appendChild(status);
    root.appendChild(bar);
    records.forEach(function(record, index) {
      root.appendChild(renderSheet(record, properties, index, records.length));
    });
    document.body.appendChild(root);
    document.body.classList.add('gbd-printing');

    // A4の印刷範囲（余白10mmを除いた高さ277mm）を超えた帳票を数える
    var probe = element('div', 'gbd-probe');
    root.appendChild(probe);
    var limit = probe.getBoundingClientRect().height;
    root.removeChild(probe);
    var over = 0;
    Array.prototype.forEach.call(root.querySelectorAll('.gbd-inner'), function(inner) {
      if (limit && inner.getBoundingClientRect().height > limit + 1) {
        inner.parentNode.classList.add('gbd-over');
        over++;
      }
    });

    var text = [records.length + '件'].concat(notes || []);
    if (over) text.push('1枚に収まらない帳票 ' + over + '件（赤枠。印刷すると2枚以上になります）');
    status.textContent = text.join('、');
    print.addEventListener('click', function() {
      window.print();
    });
    shut.addEventListener('click', close);
  }

  function fetchFields() {
    return kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: kintone.app.getId()}).then(function(response) {
      return response.properties;
    });
  }

  function listQuery() {
    return (kintone.app.getQuery() || '').replace(/\s*limit\s+\d+(\s+offset\s+\d+)?\s*$/i, '').trim();
  }

  function fetchRecords(query) {
    var collected = [];
    var total = null;
    function step(offset) {
      var size = Math.min(FETCH_LIMIT, MAX_RECORDS - collected.length);
      var body = {app: kintone.app.getId(), query: (query ? query + ' ' : '') + 'limit ' + size + ' offset ' + offset};
      if (offset === 0) body.totalCount = true;
      return kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', body).then(function(response) {
        if (offset === 0 && response.totalCount !== null && response.totalCount !== undefined) total = Number(response.totalCount);
        collected = collected.concat(response.records);
        if (response.records.length < size || collected.length >= MAX_RECORDS) return {records: collected, total: total};
        return step(offset + size);
      });
    }
    return step(0);
  }

  function failed(error) {
    window.alert('帳票を作れませんでした。' + ((error && error.message) || ''));
  }

  function button(onClick) {
    var node = element('button', 'gbd-open', title + 'を印刷');
    node.type = 'button';
    node.id = 'gbd-open';
    node.addEventListener('click', onClick);
    return node;
  }

  kintone.events.on('app.record.index.show', function(event) {
    var space = kintone.app.getHeaderMenuSpaceElement();
    if (space && !document.getElementById('gbd-open')) {
      space.appendChild(button(function() {
        Promise.all([fetchFields(), fetchRecords(listQuery())]).then(function(results) {
          var found = results[1];
          if (!found.records.length) {
            window.alert('印刷するレコードがありません。');
            return;
          }
          var notes = [];
          if (found.total !== null && found.total > found.records.length) {
            notes.push('上限' + MAX_RECORDS + '件。残り ' + (found.total - found.records.length) + '件は、絞り込んでから印刷してください');
          }
          open(found.records, results[0], notes);
        }).catch(failed);
      }));
    }
    return event;
  });

  kintone.events.on('app.record.detail.show', function(event) {
    var space = kintone.app.record.getHeaderMenuSpaceElement();
    if (space && !document.getElementById('gbd-open')) {
      space.appendChild(button(function() {
        // 押した時点の内容を使う。取れなければ画面を開いたときの内容
        var current = kintone.app.record.get();
        var record = (current && current.record) || event.record;
        fetchFields().then(function(properties) {
          open([record], properties);
        }).catch(failed);
      }));
    }
    return event;
  });
})(kintone.$PLUGIN_ID);
