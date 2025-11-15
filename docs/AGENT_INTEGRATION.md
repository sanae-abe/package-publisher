# Claude Code Agent Integration Guide

package-publisherをClaude Codeエージェントとして統合するためのガイドです（Rust実装）。

## 📋 目次

- [概要](#概要)
- [セットアップ](#セットアップ)
- [エージェント定義](#エージェント定義)
- [使用方法](#使用方法)
- [コマンドリファレンス](#コマンドリファレンス)
- [トラブルシューティング](#トラブルシューティング)
- [セキュリティベストプラクティス](#セキュリティベストプラクティス)

## 概要

package-publisherは、複数のパッケージレジストリ（npm, crates.io, PyPI, Homebrew）への公開を自動化するRust製CLIツールです。

### 主な機能

- 🔍 **自動検出**: プロジェクトの種類を自動判別
- ✅ **検証**: パッケージメタデータ、テスト、Lintの実行
- 🔒 **セキュリティ**: 機密情報スキャン（aho-corasick高速化）、Shannon entropy分析
- 🎯 **Dry-run**: 実際の公開前にシミュレーション
- ♻️ **ロールバック**: 公開の取り消し（レジストリ依存）
- 📊 **状態管理**: 再開可能なワークフロー（11段階）
- 📈 **Analytics**: JSON永続化、統計レポート

### 対応レジストリ

| レジストリ | 言語 | 検出ファイル |
|-----------|------|-------------|
| npm | JavaScript/TypeScript | package.json |
| crates.io | Rust | Cargo.toml |
| PyPI | Python | pyproject.toml, setup.py |
| Homebrew | 任意 | Formula/*.rb |

## セットアップ

### 1. インストール

```bash
# crates.ioからインストール（公開後）
cargo install package-publisher

# またはソースからビルド
git clone https://github.com/sanae-abe/package-publisher
cd package-publisher
cargo build --release

# バイナリ確認
./target/release/package-publisher --version
```

### 2. Claude Code エージェント登録

エージェント定義ファイル（`agent-definition.yaml`）をClaude Code設定ディレクトリに配置：

```bash
# エージェント定義をコピー
cp agent-definition.yaml ~/.claude/agents/package-publisher.yaml
```

### 3. 環境変数設定

各レジストリの認証トークンを環境変数で設定：

```bash
# npm
export NPM_TOKEN="your-npm-token"

# crates.io
export CARGO_REGISTRY_TOKEN="your-crates-token"

# PyPI
export TWINE_USERNAME="__token__"
export TWINE_PASSWORD="your-pypi-token"

# Homebrew (GitHub)
export HOMEBREW_GITHUB_API_TOKEN="your-github-token"
```

**推奨**: `.env`ファイルや1Password等のシークレット管理ツールを使用してください。

## エージェント定義

`agent-definition.yaml`の内容：

```yaml
name: package-publisher
version: 0.1.0
description: Multi-registry package publishing assistant (Rust)

capabilities:
  - package_detection
  - validation
  - security_scan
  - dry_run
  - publish
  - verification
  - rollback
  - analytics

registries:
  - npm
  - crates.io
  - pypi
  - homebrew

commands:
  check:
    description: Check if project is ready to publish
    usage: package-publisher check [--registry <name>]

  publish:
    description: Publish package to registry
    usage: package-publisher publish [options]
    options:
      - --dry-run-only: Only perform dry-run
      - --non-interactive: Run in CI/CD mode
      - --registry <name>: Specify target registry
      - --registries <list>: Batch publish to multiple registries
      - --sequential: Publish sequentially (not parallel)
      - --resume: Resume from previous state

  stats:
    description: Display publishing statistics
    usage: package-publisher stats [--days <N>]

  report:
    description: Generate analytics report
    usage: package-publisher report [--format <markdown|json>]

security:
  secrets_scanning:
    enabled: true
    patterns: 23  # プレフィックス検出数
    algorithm: aho-corasick
  credential_validation:
    enabled: true
    algorithm: shannon_entropy
  command_injection_prevention: enabled
  safe_command_executor: whitelist-based
```

## 使用方法

### Claude Codeでの基本的な使い方

#### 1. パッケージチェック

```
User: package-publisherでこのプロジェクトをチェックして

Claude: パッケージのチェックを開始します。
[package-publisher check を実行]

検出されたレジストリ: npm

📦 npm:
  ✅ 検証成功
  パッケージ名: my-package
  バージョン: 1.0.0

  ⚠️ 警告:
    - [scripts.lint] lintスクリプトの設定を推奨します
```

#### 2. Dry-run公開

```
User: dry-runで公開をシミュレートして

Claude: Dry-runを実行します。
[package-publisher publish --dry-run-only を実行]

🚀 Dry-run実行中...

📦 npm:
  package size: 10.5 kB
  unpacked size: 50 kB
  total files: 25

✅ Dry-run成功
```

#### 3. 本番公開

```
User: npmに公開して

Claude: 公開プロセスを開始します。セキュリティスキャンを実行します...

⚠️ 確認が必要です:
パッケージ: my-package@1.0.0
レジストリ: npm
公開URL: https://www.npmjs.com/package/my-package

公開しますか？ (yes/no)

User: yes

Claude: 公開中...
✅ 公開成功
```

### コマンドラインでの使い方

#### プロジェクトチェック

```bash
# 全レジストリ自動検出
package-publisher check

# 特定レジストリのみ
package-publisher check --registry npm
```

#### 公開

```bash
# 対話的公開（推奨）
package-publisher publish

# Dry-runのみ
package-publisher publish --dry-run-only

# 特定レジストリに公開
package-publisher publish --registry npm

# CI/CD向け非対話的公開
package-publisher publish --non-interactive

# 複数レジストリへのバッチ公開
package-publisher publish --registries npm,pypi,crates

# 順次公開（並列ではなく）
package-publisher publish --registries npm,pypi --sequential

# 状態から再開
package-publisher publish --resume
```

#### Analytics

```bash
# 公開統計の表示
package-publisher stats --days 30

# レポートの生成
package-publisher report --format markdown --output report.md
```

## コマンドリファレンス

### `check` コマンド

プロジェクトが公開可能な状態かチェックします。

**オプション**:
- `-r, --registry <name>`: チェックするレジストリを指定

**実行内容**:
1. レジストリ自動検出
2. メタデータ検証
3. テスト実行（存在する場合）
4. Lint実行（存在する場合）
5. セキュリティスキャン

**終了コード**:
- `0`: 検証成功
- `1`: 検証失敗

### `publish` コマンド

パッケージをレジストリに公開します。

**オプション**:
- `-r, --registry <name>`: 公開先レジストリ
- `--registries <list>`: 複数レジストリ指定（カンマ区切り）
- `--dry-run-only`: Dry-runのみ実行
- `--non-interactive`: 非対話モード（CI/CD向け）
- `--sequential`: 順次公開（デフォルトは並列）
- `--resume`: 中断した公開を再開

**実行フロー（11段階）**:
1. レジストリ検出
2. 設定読み込み
3. バリデーション
4. セキュリティスキャン
5. Dry-run実行
6. ユーザー確認（対話モードのみ）
7. 公開実行
8. 検証（レジストリAPI確認）
9. Analytics記録
10. 通知（オプション）
11. クリーンアップ

**終了コード**:
- `0`: 公開成功
- `1`: 公開失敗

### `stats` コマンド

公開統計を表示します。

**オプション**:
- `--days <N>`: 過去N日間の統計

### `report` コマンド

Analytics レポートを生成します。

**オプション**:
- `--format <markdown|json>`: レポート形式
- `--output <path>`: 出力ファイルパス

## トラブルシューティング

### よくある問題

#### 1. 認証エラー

**エラー**: `Authentication failed for registry`

**解決方法**:
```bash
# トークンが設定されているか確認
echo $NPM_TOKEN
echo $CARGO_REGISTRY_TOKEN

# トークンを再設定
export NPM_TOKEN="your-new-token"

# トークンの有効期限を確認
npm token list
```

#### 2. 機密情報検出

**エラー**: `Secrets detected in package`

**解決方法**:

**誤検出の場合**（テストファイル、サンプル）:
```yaml
# .publish-config.yaml
security:
  secretsScanning:
    ignorePatterns:
      - "**/*test*.{rs,ts,js,py}"
      - "docs/**/*.md"
```

### デバッグモード

詳細なログを確認する場合：

```bash
# 環境変数でデバッグモード有効化
RUST_LOG=debug package-publisher publish

# バックトレース有効化
RUST_BACKTRACE=1 package-publisher publish
```

## セキュリティベストプラクティス

### 1. トークン管理

❌ **悪い例**:
```rust
// ハードコード（絶対にしない）
const TOKEN: &str = "npm_abc123xyz...";
```

✅ **良い例**:
```bash
# 環境変数使用
export NPM_TOKEN="npm_abc123xyz..."
```

✅ **さらに良い例**:
```bash
# シークレット管理ツール使用（1Password CLI）
export NPM_TOKEN=$(op read "op://Private/npm-token/token")
```

### 2. CI/CD統合

GitHub Actionsでの例：

```yaml
name: Publish Package

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Build package-publisher
        run: cargo build --release

      - name: Run tests
        run: cargo test --lib

      - name: Publish to npm
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          ./target/release/package-publisher publish \
            --non-interactive \
            --registry npm
```

### 3. 権限最小化

トークンには必要最小限の権限のみを付与：

- **npm**: Publish権限のみ
- **crates.io**: Publish権限のみ
- **PyPI**: Upload権限のみ
- **Homebrew**: リポジトリへのPush権限のみ

### 4. 監査ログ

公開履歴を記録：

```bash
# 公開ログをファイルに保存
package-publisher publish 2>&1 | tee publish-$(date +%Y%m%d-%H%M%S).log

# Analytics機能で統計確認
package-publisher stats --days 30
package-publisher report --format markdown --output report.md
```

### 5. Dry-run必須

本番公開前に必ずDry-runを実行：

```bash
# 1. Dry-run
package-publisher publish --dry-run-only

# 2. 問題なければ本番公開
package-publisher publish
```

## 高度な使用例

### カスタムワークフロー

```bash
#!/bin/bash
set -e

echo "📦 Publishing workflow started"

# 1. Pre-publish checks
echo "1️⃣ Running checks..."
package-publisher check

# 2. Dry-run
echo "2️⃣ Running dry-run..."
package-publisher publish --dry-run-only

# 3. Confirmation
read -p "Proceed with publish? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "❌ Publish cancelled"
  exit 1
fi

# 4. Publish
echo "3️⃣ Publishing..."
package-publisher publish --non-interactive

# 5. Verify
echo "4️⃣ Verifying..."
sleep 10  # Wait for registry propagation
npm view my-package@$(cargo metadata --format-version 1 | jq -r '.packages[0].version')

echo "✅ Publish workflow completed"
```

### 複数レジストリへの公開

```bash
# npm, PyPI, crates.ioに同時公開
package-publisher publish --registries npm,pypi,crates

# エラー時も継続
package-publisher publish --registries npm,pypi,crates --continue-on-error

# Homebrewの場合は別途Tap更新が必要
cd ~/homebrew-tap
git pull
package-publisher publish --registry homebrew
```

## 関連ドキュメント

- [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md) - カスタムプラグイン開発（Rust）
- [CLI Testing Guide](./CLI-TESTING-GUIDE.md) - CLI Testing Specialist統合
- [CI/CD Integration](./CI_CD_INTEGRATION.md) - CI/CD統合ガイド

## サポート

- **Issues**: https://github.com/sanae-abe/package-publisher/issues
- **Discussions**: https://github.com/sanae-abe/package-publisher/discussions

---

**Last Updated**: 2025-11-15
**Version**: 0.1.0 (Rust)
