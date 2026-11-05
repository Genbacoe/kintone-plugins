(function(PLUGIN_ID) {
  'use strict';

  var MAX_PHOTOS = 300;
  var FETCH_LIMIT = 500;
  var CONCURRENCY = 4;
  var INFO = [['date', '撮影日'], ['work', '工種'], ['place', '場所・測点'], ['note', '説明']];
  var config = kintone.plugin.app.getConfig(PLUGIN_ID);

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function display(field) {
    if (!field || field.value === null || field.value === undefined) return '';
    var value = field.value;
    if (Array.isArray(value)) return value.map(function(v) { return v.name || v; }).join('、');
    if (typeof value === 'object') return value.name || '';
    return String(value);
  }

  function fromRecord(record) {
    var photos = [];
    function push(files, row) {
      (files || []).forEach(function(file) {
        var item = {file: file};
        ['project'].concat(INFO.map(function(i) { return i[0]; })).forEach(function(key) {
          var code = config[key];
          item[key] = code ? display((row && row[code]) || record[code]) : '';
        });
        photos.push(item);
      });
    }
    if (record[config.photo]) {
      push(record[config.photo].value);
      return photos;
    }
    Object.keys(record).forEach(function(code) {
      if (record[code].type !== 'SUBTABLE') return;
      record[code].value.forEach(function(row) {
        if (row.value[config.photo]) push(row.value[config.photo].value, row.value);
      });
    });
    return photos;
  }

  function listQuery() {
    return (kintone.app.getQuery() || '').replace(/\s*limit\s+\d+(\s+offset\s+\d+)?\s*$/i, '');
  }

  function fetchRecords(query, offset, collected) {
    var body = {app: kintone.app.getId(), query: query + ' limit ' + FETCH_LIMIT + ' offset ' + offset};
    return kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', body).then(function(response) {
      var all = collected.concat(response.records);
      if (response.records.length < FETCH_LIMIT || all.length >= MAX_PHOTOS) return all;
      return fetchRecords(query, offset + FETCH_LIMIT, all);
    });
  }

  function fetchImage(fileKey) {
    var url = kintone.api.urlForGet('/k/v1/file.json', {fileKey: fileKey}, true);
    return fetch(url, {headers: {'X-Requested-With': 'XMLHttpRequest'}, credentials: 'same-origin'}).then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.blob();
    }).then(function(blob) {
      return URL.createObjectURL(blob);
    });
  }

  function loadImages(photos, onProgress) {
    var next = 0;
    var finished = 0;
    function worker() {
      if (next >= photos.length) return Promise.resolve();
      var photo = photos[next++];
      return fetchImage(photo.file.fileKey).then(function(src) {
        photo.src = src;
        return new Promise(function(resolve) {
          photo.image.onload = resolve;
          photo.image.onerror = function() {
            photo.failed = true;
            resolve();
          };
          photo.image.src = src;
        });
      }).catch(function() {
        photo.failed = true;
      }).then(function() {
        onProgress(++finished);
        return worker();
      });
    }
    var workers = [];
    for (var i = 0; i < CONCURRENCY; i++) workers.push(worker());
    return Promise.all(workers);
  }

  function paginate(photos) {
    var perPage = Number(config.perPage) || 3;
    var pages = [];
    photos.forEach(function(photo) {
      var last = pages[pages.length - 1];
      if (!last || last.length >= perPage || last[0].project !== photo.project) {
        pages.push([photo]);
      } else {
        last.push(photo);
      }
    });
    return pages;
  }

  function renderRow(photo) {
    var row = element('div', 'gbk-row');
    var frame = element('div', 'gbk-photo');
    photo.image = document.createElement('img');
    photo.image.alt = photo.file.name;
    frame.appendChild(photo.image);
    var info = element('dl', 'gbk-info');
    INFO.forEach(function(entry) {
      if (!config[entry[0]]) return;
      info.appendChild(element('dt', '', entry[1]));
      info.appendChild(element('dd', '', photo[entry[0]] || ' '));
    });
    row.appendChild(frame);
    row.appendChild(info);
    return row;
  }

  function open(records) {
    var all = [];
    records.forEach(function(record) {
      all = all.concat(fromRecord(record));
    });
    var images = all.filter(function(p) { return /^image\/(jpeg|png|gif|webp)$/i.test(p.file.contentType); });
    var skipped = all.length - images.length;
    var over = Math.max(images.length - MAX_PHOTOS, 0);
    var photos = images.slice(0, MAX_PHOTOS);
    if (!photos.length) {
      window.alert('印刷できる写真がありません。JPEG、PNGなどの画像を添付してください。');
      return;
    }

    var root = element('div');
    root.id = 'gbk-ledger';
    var bar = element('div', 'gbk-bar');
    var print = element('button', 'gbk-print', '印刷');
    var close = element('button', '', '閉じる');
    var status = element('span');
    print.type = close.type = 'button';
    print.disabled = true;
    bar.appendChild(print);
    bar.appendChild(close);
    bar.appendChild(status);
    root.appendChild(bar);

    var pages = paginate(photos);
    pages.forEach(function(items, index) {
      var page = element('section', 'gbk-page');
      var head = element('div', 'gbk-head');
      head.appendChild(element('b', '', '工事写真台帳'));
      head.appendChild(element('span', '', items[0].project));
      head.appendChild(element('span', '', (index + 1) + ' / ' + pages.length));
      page.appendChild(head);
      items.forEach(function(photo) {
        page.appendChild(renderRow(photo));
      });
      for (var i = items.length; i < (Number(config.perPage) || 3); i++) {
        page.appendChild(element('div', 'gbk-row'));
      }
      root.appendChild(page);
    });
    document.body.appendChild(root);

    print.addEventListener('click', function() {
      window.print();
    });
    close.addEventListener('click', function() {
      photos.forEach(function(p) {
        if (p.src) URL.revokeObjectURL(p.src);
      });
      root.parentNode.removeChild(root);
    });

    status.textContent = '写真を読み込み中 0 / ' + photos.length;
    loadImages(photos, function(done) {
      status.textContent = '写真を読み込み中 ' + done + ' / ' + photos.length;
    }).then(function() {
      var failed = photos.filter(function(p) { return p.failed; }).length;
      var notes = [photos.length + '枚', pages.length + 'ページ'];
      if (failed) notes.push('読み込み失敗 ' + failed + '枚');
      if (skipped) notes.push('画像以外と未対応形式 ' + skipped + '件は除外');
      if (over) notes.push('上限' + MAX_PHOTOS + '枚を超えた ' + over + '枚は除外');
      status.textContent = notes.join('、');
      print.disabled = false;
    });
  }

  function button(onClick) {
    var node = element('button', 'gbk-open', '写真台帳を印刷');
    node.type = 'button';
    node.id = 'gbk-open';
    node.addEventListener('click', onClick);
    return node;
  }

  kintone.events.on('app.record.index.show', function(event) {
    var space = kintone.app.getHeaderMenuSpaceElement();
    if (config.photo && space && !document.getElementById('gbk-open')) {
      space.appendChild(button(function() {
        fetchRecords(listQuery(), 0, []).then(open).catch(function(error) {
          window.alert('レコードを取得できませんでした。' + (error.message || ''));
        });
      }));
    }
    return event;
  });

  kintone.events.on('app.record.detail.show', function(event) {
    var space = kintone.app.record.getHeaderMenuSpaceElement();
    if (config.photo && space && !document.getElementById('gbk-open')) {
      space.appendChild(button(function() {
        open([event.record]);
      }));
    }
    return event;
  });
})(kintone.$PLUGIN_ID);
