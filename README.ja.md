# 📦 package-publisher

[English](./README.md) | [日本語](./README.ja.md)

> Homebrew、crates.io、npm、PyPI など複数のレジストリに対応したパッケージ公開支援ツール

![Tests](https://img.shields.io/badge/tests-367%20passed-success)
![Coverage](https://img.shields.io/badge/coverage-89%25-success)
![TypeScript](https://img.shields.io/badge/typescript-strict-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)

**package-publisher** は、複数のパッケージレジストリへの公開作業を安全かつ効率的に支援するClaude Code agentです。

## ✨ 主な機能

### 🎯 複数レジストリ対応

- **npm**: Node.jsパッケージ（2FA/OTP対応、スコープパッケージ対応）
- **crates.io**: Rustクレート（Cargo.tomlバリデーション）
- **PyPI**: Pythonパッケージ（TestPyPI対応）
- **Homebrew**: macOSパッケージ（Formulaバリデーション）

### 🔒 セキュリティ重視

- ✅ シークレットスキャナー（APIキー、パスワード、トークンの検出）
- ✅ ログ内のトークンマスキング
- ✅ コマンドインジェクション防止
- ✅ 安全な環境変数ハンドリング

### 🚀 公開ワークフロー

1. **自動検出**: 適用可能なレジストリを自動検出
2. **検証**: メタデータチェック、テスト実行、リント
3. **ドライラン**: 実際の公開を行わずにプレビュー
4. **確認**: インタラクティブな確認（または `--non-interactive`）
5. **公開**: リトライロジックとエラーハンドリングを備えた実行
6. **検証**: 公開成功の確認
7. **ロールバック**: 非公開/非推奨化のサポート（レジストリ依存）

### 🔄 回復力

- ✅ 再開機能付きステートマシン
- ✅ 指数バックオフによるリトライロジック
- ✅ ネットワークエラーハンドリング
- ✅ 推奨アクションを含む包括的なエラーメッセージ

### 🎛️ 高度な機能

- **設定システム**: YAML設定ファイル（.publish-config.yaml）
  - 優先度管理（CLI > Env > Project > Global > Default）
  - 環境変数展開（セキュリティ制限付き）
  - 詳細なバリデーションエラーメッセージ

- **バッチ公開**: 複数レジストリへの一括公開
  - 並列/直列実行の選択可能
  - エラー時の継続/停止設定
  - 同時実行数の制限（デフォルト3）

- **フックシステム**: カスタマイズ可能なフック
  - 4つのフックフェーズ（preBuild、prePublish、postPublish、onError）
  - 環境変数展開、コマンドホワイトリスト検証
  - タイムアウト制御（デフォルト300秒）

- **通知機能**: 公開結果の通知
  - Slack Webhook統合（リッチメッセージ対応）
  - Email通知（SendGrid API経由）
  - プラガブル設計で拡張可能

- **プラグインシステム**: カスタムレジストリ対応
  - PublishPluginインターフェース
  - 動的プラグインロード（npm/ローカル）
  - サンプルプラグイン・詳細ドキュメント完備

- **分析とレポート**: 公開統計
  - レジストリ別成功率追跡
  - Markdown/JSON形式レポート
  - CLI統合（`stats`、`report`コマンド）

**品質指標**:
- ✅ **367テスト**（15テストスイート、全合格）
- ✅ **89%以上のテストカバレッジ**
- ✅ **TypeScript strict mode**完全準拠
- ✅ **ESLint**エラー・警告0件

## 📚 ユースケース

### モノレポでの複数パッケージ公開
- 一度の操作で複数レジストリ（npm、PyPI、crates.io）に公開
- 統一された検証プロセスでセキュリティを担保
- バッチ公開機能で効率的なリリース

### CI/CDパイプラインでの自動公開
- タグプッシュで自動的に本番公開
- Slack/Email通知で即座にチーム全体に共有
- フックシステムで公開前後の処理をカスタマイズ

### セキュリティ重視の公開フロー
- Secrets Scanner自動実行で機密情報の混入を防止
- 2FA/OTP対応でアカウント保護
- トークンマスキングでログの安全性を確保

### エンタープライズレベルの運用
- YAML設定ファイルでチーム全体の設定を統一
- Analytics機能で公開成功率を追跡
- Plugin Systemでカスタムレジストリにも対応

## 🚀 クイックスタート

### インストール

**システム要件**:
- Node.js 18.x以上
- npm 9.x以上

**開発版のセットアップ**:
```bash
git clone https://github.com/sanae-abe/package-publisher
cd package-publisher
npm install
npm run build
```

**グローバルインストール**（npm公開後）:
```bash
npm install -g package-publisher
```

**npx使用**（インストール不要）:
```bash
npx package-publisher publish
```

### CLIとしての使用

```bash
# 自動検出されたレジストリに公開
package-publisher publish

# ドライランのみ
package-publisher publish --dry-run-only

# レジストリを指定
package-publisher publish --registry npm

# 非インタラクティブモード（CI/CD向け）
package-publisher publish --non-interactive

# 2FA/OTPを使用（npm）
package-publisher publish --registry npm --otp 123456

# 前回の状態から再開
package-publisher publish --resume

# プロジェクトステータスの確認
package-publisher check

# 設定ファイルの使用
package-publisher publish --config .publish-config.yaml

# 複数レジストリへのバッチ公開
package-publisher publish --registries npm,pypi,crates

# 順次公開（並列ではなく）
package-publisher publish --registries npm,pypi --sequential

# フックをスキップ
package-publisher publish --skip-hooks

# 公開統計の表示
package-publisher stats --days 30

# レポートの生成
package-publisher report --format markdown --output report.md
```

### Claude Code Agentとしての使用

```bash
# Claude Code agentとしてインストール
ln -s ~/projects/package-publisher/agent-definition.yaml \
      ~/.claude/agents/package-publisher.yaml

# Claude Codeで使用
"Please help me publish this package to npm with all necessary checks"
```

## 📁 プロジェクト構造

```
package-publisher/
├── src/
│   ├── core/
│   │   ├── interfaces.ts          # コア型定義
│   │   ├── PublishStateMachine.ts # 状態管理
│   │   ├── ErrorHandling.ts       # エラーファクトリ＆コード
│   │   ├── RetryManager.ts        # バックオフ付きリトライロジック
│   │   ├── PackagePublisher.ts    # メインオーケストレーター
│   │   ├── ConfigLoader.ts        # YAML設定ローダー
│   │   ├── PublishConfig.ts       # 設定型定義
│   │   ├── BatchPublisher.ts      # 複数レジストリのバッチ公開
│   │   ├── HookExecutor.ts        # 公開前後のフック
│   │   ├── PublishAnalytics.ts    # 分析＆レポート
│   │   └── PluginLoader.ts        # 動的プラグインローダー
│   ├── plugins/
│   │   ├── NPMPlugin.ts           # npm/npmjs.com
│   │   ├── CratesIOPlugin.ts      # Rust/crates.io
│   │   ├── PyPIPlugin.ts          # Python/PyPI
│   │   └── HomebrewPlugin.ts      # Homebrew Formula
│   ├── notifications/             # 通知システム
│   │   ├── NotificationManager.ts # 通知オーケストレーター
│   │   ├── SlackNotifier.ts       # Slack Webhook統合
│   │   └── EmailNotifier.ts       # Email通知（SendGrid）
│   ├── security/
│   │   ├── SecureTokenManager.ts  # トークン処理＆マスキング
│   │   ├── SecretsScanner.ts      # 10種類のシークレットパターン検出
│   │   └── SafeCommandExecutor.ts # コマンドインジェクション防止
│   ├── cli.ts                     # CLIインターフェース（Commander.js）
│   └── index.ts                   # ライブラリエクスポート
├── tests/unit/                    # 15テストスイート、367テスト、89%カバレッジ
│   ├── NPMPlugin.test.ts
│   ├── CratesIOPlugin.test.ts
│   ├── PyPIPlugin.test.ts
│   ├── HomebrewPlugin.test.ts
│   ├── PackagePublisher.test.ts
│   ├── ConfigLoader.test.ts       # 31テスト
│   ├── BatchPublisher.test.ts     # バッチ公開テスト
│   ├── HookExecutor.test.ts       # 32テスト
│   ├── NotificationManager.test.ts # 11テスト
│   ├── SlackNotifier.test.ts      # 15テスト
│   ├── EmailNotifier.test.ts      # 18テスト
│   ├── PluginLoader.test.ts       # 25テスト
│   ├── PublishAnalytics.test.ts   # 25テスト
│   ├── SafeCommandExecutor.test.ts # 19テスト、100%カバレッジ
│   └── SecureTokenManager.test.ts  # 34テスト、100%カバレッジ
├── docs/
│   ├── AGENT_INTEGRATION.md       # Claude Code統合ガイド
│   ├── PLUGIN_DEVELOPMENT.md      # カスタムプラグイン開発ガイド
│   └── CI_CD_INTEGRATION.md       # CI/CD統合
├── .github/workflows/
│   ├── publish-npm.yml            # GitHub Actions（単一レジストリ）
│   └── publish-multiregistry.yml  # 複数レジストリ公開
├── examples/
│   └── plugin-example/            # サンプルプラグイン実装
├── agent-definition.yaml          # Claude Code agent定義
├── .publish-config.example.yaml   # 設定ファイルサンプル
├── PHASE4_PLAN.md                 # 実装計画＆ステータス
├── .eslintrc.js                   # TypeScript strict mode ESLint
├── .prettierrc                    # コード整形ルール
└── package.json
```

## 🔧 開発

### セットアップ

```bash
npm install
```

### ビルド

```bash
npm run build
```

### テスト

```bash
# すべてのテストを実行
npm test

# Watchモード
npm run test:watch

# カバレッジレポート
npm run test:coverage
```

### リント＆フォーマット

```bash
npm run lint
npm run format
```

## 📖 ドキュメント

- [Agent統合ガイド](./docs/AGENT_INTEGRATION.md) - Claude Code使用方法、トラブルシューティング
- [プラグイン開発ガイド](./docs/PLUGIN_DEVELOPMENT.md) - カスタムプラグイン開発ガイド
- [CI/CD統合ガイド](./docs/CI_CD_INTEGRATION.md) - GitHub Actions、GitLab CI、CircleCI統合

## 🔧 トラブルシューティング

### よくある問題と解決方法

#### 認証エラー（AUTHENTICATION_FAILED）
**症状**: `Authentication failed for registry`エラー

**解決方法**:
```bash
# トークンの確認
echo $NPM_TOKEN  # npmの場合
echo $CARGO_REGISTRY_TOKEN  # crates.ioの場合

# トークンの再設定
export NPM_TOKEN="your-token-here"

# 2FA/OTPが必要な場合
package-publisher publish --registry npm --otp 123456
```

#### シークレットスキャナーによるブロック
**症状**: `Secrets detected in package`エラー

**解決方法**:
```bash
# .gitignoreに機密ファイルを追加
echo ".env" >> .gitignore
echo "credentials.json" >> .gitignore

# コミットから機密情報を削除
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch path/to/secret/file' \
  --prune-empty --tag-name-filter cat -- --all
```

#### ネットワークエラー
**症状**: タイムアウトや接続エラー

**解決方法**:
```bash
# リトライ回数を増やす
package-publisher publish --max-retries 5

# プロキシ設定（必要な場合）
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
```

#### テスト失敗
**症状**: 公開前のテストが失敗

**解決方法**:
```bash
# ローカルでテストを実行
npm test

# テストをスキップ（非推奨）
package-publisher publish --skip-verification
```

### ログの確認

```bash
# 詳細ログの出力
package-publisher publish --verbose

# デバッグモード
DEBUG=* package-publisher publish
```

### サポート

問題が解決しない場合は、以下をご利用ください：
- [GitHub Issues](https://github.com/sanae-abe/package-publisher/issues) - バグ報告・機能リクエスト
- [GitHub Discussions](https://github.com/sanae-abe/package-publisher/discussions) - 質問・相談

## 🤝 コントリビューション

貢献を歓迎します！このプロジェクトへの貢献に興味がある方は、GitHubのIssuesまたはPull Requestsをご利用ください。

## 📄 ライセンス

MIT License - 詳細は[LICENSE](./LICENSE)をご覧ください。

## 🔗 リンク

- [GitHubリポジトリ](https://github.com/sanae-abe/package-publisher)
- [Issues](https://github.com/sanae-abe/package-publisher/issues)
- [Discussions](https://github.com/sanae-abe/package-publisher/discussions)

## 🙏 謝辞

安全かつ効率的なパッケージ公開を実現するClaude Code agentとして、❤️を込めて開発されました。
