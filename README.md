# ゲンバコエ kintone プラグイン

建設の現場で使う kintone プラグインです。見積書の印刷、工事写真台帳、工程表、出面、日報・KY、期限アラート、進捗の表示。すべて無料で、MIT ライセンスで公開しています。

| プラグイン | できること | 説明とダウンロード |
|---|---|---|
| [作業日報・KY記録プリント](daily-report/) | レコードを、検印欄や署名欄つきのA4の作業日報やKY活動記録にして印刷します。一覧からまとめて印刷もできます。 | https://genbakoe.com/kintone/daily-report/ |
| [出面（人工）月次集計プリント](dezura/) | 日々の出面レコードから、協力会社ごとの人工を月の日別に集計して、A4で印刷します。会社ごとの確認表も作れます。 | https://genbakoe.com/kintone/dezura/ |
| [工事見積書プリント](estimate/) | テーブルの明細から小計、諸経費、法定福利費、値引き、消費税を計算し、A4の工事見積書にして印刷します。 | https://genbakoe.com/kintone/estimate/ |
| [現場の期限アラート](expiry-alert/) | 資格、車検、許可、保険、工期などの日付を、期限切れは赤、期限が近いものは黄色で表示します。 | https://genbakoe.com/kintone/expiry-alert/ |
| [進捗バー・段階表示](indicator/) | 数値のフィールドを進捗バーに、ドロップダウンやステータスを段階表示にして、一覧と詳細の画面に出します。予定と比べた遅れも表示できます。 | https://genbakoe.com/kintone/indicator/ |
| [工程表ガントプリント](koutei-gantt/) | 工程のレコードを、工事ごとにまとめた横棒の工程表にして、A4横かA3横で印刷します。進捗率と実績の線も描けます。 | https://genbakoe.com/kintone/koutei-gantt/ |
| [現場写真台帳プリント](photo-ledger/) | 添付した工事写真を、撮影日や工種とあわせてA4の写真台帳にして印刷します。 | https://genbakoe.com/kintone/photo-ledger/ |

## 入れ方

1. 上の表の「説明とダウンロード」のページから、プラグインのファイル（zip）をダウンロードします。
2. kintone の「kintoneシステム管理」→「プラグイン」で読み込みます。
3. 使うアプリの「設定」→「プラグイン」で追加し、項目の対応を設定します。

各プラグインのフィールドの作り方と画面は、[genbakoe.com/kintone/](https://genbakoe.com/kintone/) にまとめています。

## ソース

各フォルダの `src/` が、プラグインの中身（manifest.json、JavaScript、CSS、設定画面）です。自分で手を加えて使うときは、[kintone プラグイン開発ツール（plugin-packer）](https://github.com/kintone/js-sdk/tree/main/packages/plugin-packer) で zip にします。署名の鍵は各自で作ってください。

## ライセンス

MIT License。詳しくは [LICENSE](LICENSE)。

不具合や要望は Issues へ。サイト：[ゲンバコエ](https://genbakoe.com/)
