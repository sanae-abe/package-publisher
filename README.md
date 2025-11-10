# 📦 package-publisher

> Multi-registry package publishing assistant for Homebrew, crates.io, npm, PyPI

![Tests](https://img.shields.io/badge/tests-367%20passed-success)
![Coverage](https://img.shields.io/badge/coverage-89%25-success)
![TypeScript](https://img.shields.io/badge/typescript-strict-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)

**package-publisher** は、複数のパッケージレジストリへの公開作業を安全かつ効率的に支援するClaude Code agentです。

## ✨ Features

### 🎯 Multi-Registry Support

- **npm**: Node.js packages (2FA/OTP support, scoped packages)
- **crates.io**: Rust crates (Cargo.toml validation)
- **PyPI**: Python packages (TestPyPI support)
- **Homebrew**: macOS packages (Formula validation)

### 🔒 Security-First

- ✅ Secrets scanner (API keys, passwords, tokens detection)
- ✅ Token masking in logs
- ✅ Command injection prevention
- ✅ Safe environment variable handling

### 🚀 Publishing Workflow

1. **Auto-Detection**: Automatically detect applicable registries
2. **Validation**: Check metadata, run tests, lint
3. **Dry-Run**: Preview publishing without actual execution
4. **Confirmation**: Interactive confirmation (or `--non-interactive`)
5. **Publishing**: Execute with retry logic and error handling
6. **Verification**: Verify successful publication
7. **Rollback**: Support for unpublish/deprecate (registry-dependent)

### 🔄 Resilience

- ✅ State machine with resume capability
- ✅ Exponential backoff retry logic
- ✅ Network error handling
- ✅ Comprehensive error messages with suggested actions

### 🎛️ Advanced Features (Phase 4 完了)

- **Configuration System**: YAML設定ファイル (.publish-config.yaml)
  - 優先度管理 (CLI > Env > Project > Global > Default)
  - 環境変数展開（セキュリティ制限付き）
  - 詳細なバリデーションエラーメッセージ

- **Batch Publishing**: 複数レジストリへの一括公開
  - 並列/直列実行の選択可能
  - エラー時の継続/停止設定
  - 同時実行数の制限（デフォルト3）

- **Hooks System**: カスタマイズ可能なフック
  - 4つのフックフェーズ（preBuild, prePublish, postPublish, onError）
  - 環境変数展開、コマンドホワイトリスト検証
  - タイムアウト制御（デフォルト300秒）

- **Notifications**: 公開結果の通知
  - Slack Webhook統合（リッチメッセージ対応）
  - Email通知（SendGrid API経由）
  - プラガブル設計で拡張可能

- **Plugin System**: カスタムレジストリ対応
  - PublishPlugin インターフェース
  - 動的プラグインロード（npm/ローカル）
  - サンプルプラグイン・詳細ドキュメント完備

- **Analytics & Reporting**: 公開統計
  - レジストリ別成功率追跡
  - Markdown/JSON形式レポート
  - CLI統合（`stats`, `report` コマンド）

**品質指標**:
- ✅ **367 テスト** (15 テストスイート、全合格)
- ✅ **89%+ テストカバレッジ**
- ✅ **TypeScript strict mode** 完全準拠
- ✅ **ESLint** エラー・警告 0件

## 📚 Use Cases

### モノレポでの複数パッケージ公開
- 一度の操作で複数レジストリ（npm, PyPI, crates.io）に公開
- 統一された検証プロセスでセキュリティを担保
- バッチ公開機能で効率的なリリース

### CI/CDパイプラインでの自動公開
- タグプッシュで自動的に本番公開
- Slack/Email通知で即座にチーム全体に共有
- Hooksシステムで公開前後の処理をカスタマイズ

### セキュリティ重視の公開フロー
- Secrets Scanner自動実行で機密情報の混入を防止
- 2FA/OTP対応でアカウント保護
- トークンマスキングでログの安全性を確保

### エンタープライズレベルの運用
- YAML設定ファイルでチーム全体の設定を統一
- Analytics機能で公開成功率を追跡
- Plugin Systemでカスタムレジストリにも対応

## 🚀 Quick Start

### Installation

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

### Usage as CLI

```bash
# Publish to auto-detected registries
package-publisher publish

# Dry-run only
package-publisher publish --dry-run-only

# Specify registry
package-publisher publish --registry npm

# Non-interactive mode (CI/CD)
package-publisher publish --non-interactive

# With 2FA/OTP (npm)
package-publisher publish --registry npm --otp 123456

# Resume from previous state
package-publisher publish --resume

# Check project status
package-publisher check

# Use configuration file
package-publisher publish --config .publish-config.yaml

# Batch publish to multiple registries
package-publisher publish --registries npm,pypi,crates

# Sequential publishing (not parallel)
package-publisher publish --registries npm,pypi --sequential

# Skip hooks
package-publisher publish --skip-hooks

# View publishing statistics
package-publisher stats --days 30

# Generate report
package-publisher report --format markdown --output report.md
```

### Usage as Claude Code Agent

```bash
# Install as Claude Code agent
ln -s ~/projects/package-publisher/agent-definition.yaml \
      ~/.claude/agents/package-publisher.yaml

# Use in Claude Code
"Please help me publish this package to npm with all necessary checks"
```

## 📁 Project Structure

```
package-publisher/
├── src/
│   ├── core/
│   │   ├── interfaces.ts          # Core type definitions
│   │   ├── PublishStateMachine.ts # State management
│   │   ├── ErrorHandling.ts       # Error factory & codes
│   │   ├── RetryManager.ts        # Retry logic with backoff
│   │   ├── PackagePublisher.ts    # Main orchestrator
│   │   ├── ConfigLoader.ts        # ✅ Phase 4-1: YAML config loader
│   │   ├── PublishConfig.ts       # ✅ Phase 4-1: Config type definitions
│   │   ├── BatchPublisher.ts      # ✅ Phase 4-3: Multi-registry batch publishing
│   │   ├── HookExecutor.ts        # ✅ Phase 4-4: Pre/Post-publish hooks
│   │   ├── PublishAnalytics.ts    # ✅ Phase 4-8: Analytics & reporting
│   │   └── PluginLoader.ts        # ✅ Phase 4-6: Dynamic plugin loader
│   ├── plugins/
│   │   ├── NPMPlugin.ts           # npm/npmjs.com
│   │   ├── CratesIOPlugin.ts      # Rust/crates.io
│   │   ├── PyPIPlugin.ts          # Python/PyPI
│   │   └── HomebrewPlugin.ts      # Homebrew Formula
│   ├── notifications/             # ✅ Phase 4-5: Notification system
│   │   ├── NotificationManager.ts # Notification orchestrator
│   │   ├── SlackNotifier.ts       # Slack webhook integration
│   │   └── EmailNotifier.ts       # Email notification (SendGrid)
│   ├── security/
│   │   ├── SecureTokenManager.ts  # Token handling & masking
│   │   ├── SecretsScanner.ts      # 10 secret patterns detection
│   │   └── SafeCommandExecutor.ts # Command injection prevention
│   ├── cli.ts                     # CLI interface (Commander.js)
│   └── index.ts                   # Library exports
├── tests/unit/                    # 15 test suites, 367 tests, 89% coverage
│   ├── NPMPlugin.test.ts
│   ├── CratesIOPlugin.test.ts
│   ├── PyPIPlugin.test.ts
│   ├── HomebrewPlugin.test.ts
│   ├── PackagePublisher.test.ts
│   ├── ConfigLoader.test.ts       # ✅ Phase 4-1: 31 tests
│   ├── BatchPublisher.test.ts     # ✅ Phase 4-3: Batch publishing tests
│   ├── HookExecutor.test.ts       # ✅ Phase 4-4: 32 tests
│   ├── NotificationManager.test.ts # ✅ Phase 4-5: 11 tests
│   ├── SlackNotifier.test.ts      # ✅ Phase 4-5: 15 tests
│   ├── EmailNotifier.test.ts      # ✅ Phase 4-5: 18 tests
│   ├── PluginLoader.test.ts       # ✅ Phase 4-6: 25 tests
│   ├── PublishAnalytics.test.ts   # ✅ Phase 4-8: 25 tests
│   ├── SafeCommandExecutor.test.ts # 19 tests, 100% coverage
│   └── SecureTokenManager.test.ts  # 34 tests, 100% coverage
├── docs/
│   ├── AGENT_INTEGRATION.md       # Claude Code integration guide
│   ├── PLUGIN_DEVELOPMENT.md      # Custom plugin development guide
│   └── CI_CD_INTEGRATION.md       # ✅ Phase 4-7: CI/CD integration
├── .github/workflows/
│   ├── publish-npm.yml            # ✅ Phase 4-7: GitHub Actions (single registry)
│   └── publish-multiregistry.yml  # ✅ Phase 4-7: Multi-registry publishing
├── examples/
│   └── plugin-example/            # ✅ Phase 4-6: Sample plugin implementation
├── agent-definition.yaml          # Claude Code agent definition
├── .publish-config.example.yaml   # ✅ Phase 4-1: Configuration file example
├── PHASE4_PLAN.md                 # ✅ Phase 4 implementation plan & status
├── .eslintrc.js                   # TypeScript strict mode ESLint
├── .prettierrc                    # Code formatting rules
└── package.json
```

## 🔧 Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Lint & Format

```bash
npm run lint
npm run format
```

## 📖 Documentation

- [Agent Integration Guide](./docs/AGENT_INTEGRATION.md) - Claude Code使用方法、トラブルシューティング
- [Plugin Development Guide](./docs/PLUGIN_DEVELOPMENT.md) - カスタムプラグイン開発ガイド
- [CI/CD Integration Guide](./docs/CI_CD_INTEGRATION.md) - GitHub Actions、GitLab CI、CircleCI統合
- [Phase 4 Plan](./PHASE4_PLAN.md) - Advanced Features実装詳細と完了状況

## 🔧 Troubleshooting

### よくある問題と解決方法

#### 認証エラー (AUTHENTICATION_FAILED)
**症状**: `Authentication failed for registry` エラー

**解決方法**:
```bash
# トークンの確認
echo $NPM_TOKEN  # npm の場合
echo $CARGO_REGISTRY_TOKEN  # crates.io の場合

# トークンの再設定
export NPM_TOKEN="your-token-here"

# 2FA/OTPが必要な場合
package-publisher publish --registry npm --otp 123456
```

#### シークレットスキャナーによるブロック
**症状**: `Secrets detected in package` エラー

**解決方法**:
```bash
# .gitignore に機密ファイルを追加
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

## 🤝 Contributing

Contributions are welcome! このプロジェクトへの貢献に興味がある方は、GitHubのIssuesまたはPull Requestsをご利用ください。

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- [GitHub Repository](https://github.com/sanae-abe/package-publisher)
- [Issues](https://github.com/sanae-abe/package-publisher/issues)
- [Discussions](https://github.com/sanae-abe/package-publisher/discussions)

## 🙏 Acknowledgments

Built with ❤️ as a Claude Code agent for safe and efficient package publishing.
