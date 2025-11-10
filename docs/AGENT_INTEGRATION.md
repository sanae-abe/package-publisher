# Claude Code Agent Integration Guide

package-publisherをClaude Codeエージェントとして統合するためのガイドです。

## 📋 目次

- [概要](#概要)
- [セットアップ](#セットアップ)
- [エージェント定義](#エージェント定義)
- [使用方法](#使用方法)
- [コマンドリファレンス](#コマンドリファレンス)
- [トラブルシューティング](#トラブルシューティング)
- [セキュリティベストプラクティス](#セキュリティベストプラクティス)

## 概要

package-publisherは、複数のパッケージレジストリ（npm, crates.io, PyPI, Homebrew）への公開を自動化するClaude Codeエージェントです。

### 主な機能

- 🔍 **自動検出**: プロジェクトの種類を自動判別
- ✅ **検証**: パッケージメタデータ、テスト、Lintの実行
- 🔒 **セキュリティ**: 機密情報スキャン、安全なトークン管理
- 🎯 **Dry-run**: 実際の公開前にシミュレーション
- ♻️ **ロールバック**: 公開の取り消し（レジストリ依存）
- 📊 **状態管理**: 再開可能なワークフロー

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
# グローバルインストール
npm install -g package-publisher

# または、プロジェクトローカル
npm install --save-dev package-publisher
```

### 2. Claude Code エージェント登録

エージェント定義ファイル（`agent-definition.yaml`）をClaude Code設定ディレクトリに配置：

```bash
# エージェント定義をコピー
cp node_modules/package-publisher/agent-definition.yaml \
   ~/.claude/agents/package-publisher.yaml
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
description: Multi-registry package publishing assistant

capabilities:
  - package_detection
  - validation
  - security_scan
  - dry_run
  - publish
  - verification
  - rollback

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
      - --otp <code>: 2FA code (npm)
      - --tag <name>: Publish tag
      - --resume: Resume from previous state

security:
  token_management: environment_variables
  secrets_scanning: enabled
  command_injection_prevention: enabled
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

# 2FA対応（npm）
package-publisher publish --otp 123456

# タグ付き公開
package-publisher publish --tag beta

# 状態から再開
package-publisher publish --resume
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
- `--dry-run-only`: Dry-runのみ実行
- `--non-interactive`: 非対話モード（CI/CD向け）
- `--resume`: 中断した公開を再開
- `--otp <code>`: 2FAワンタイムパスワード（npm）
- `--tag <name>`: 公開タグ（デフォルト: latest）
- `--access <level>`: アクセスレベル（public/restricted）

**実行フロー**:
1. レジストリ検出
2. セキュリティスキャン
3. パッケージ検証
4. Dry-run実行
5. ユーザー確認（対話モードのみ）
6. 公開実行
7. 検証（レジストリAPI確認）

**終了コード**:
- `0`: 公開成功
- `1`: 公開失敗

## トラブルシューティング

### よくある問題

#### 1. 認証エラー

**エラー**: `AUTHENTICATION_FAILED: 認証に失敗しました`

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

#### 2. 2FA要求エラー（npm）

**エラー**: `OTP_REQUIRED: 2要素認証が必要です`

**解決方法**:
```bash
# OTPを指定して再実行
package-publisher publish --otp 123456
```

#### 3. バージョン競合

**エラー**: `VERSION_CONFLICT: 同じバージョンが既に公開されています`

**解決方法**:
```bash
# バージョンを更新
npm version patch  # または minor, major

# 再度公開
package-publisher publish
```

#### 4. 機密情報検出

**エラー**: `SECRETS_DETECTED: ハードコードされた機密情報が検出されました`

**解決方法**:
1. 検出されたファイルから機密情報を削除
2. 環境変数に移行
3. `.gitignore`に追加

```bash
# 機密情報を環境変数に
export API_KEY="your-api-key"

# コード内で使用
const apiKey = process.env.API_KEY
```

#### 5. 状態ファイル破損

**エラー**: `STATE_CORRUPTED: 状態ファイルが破損しています`

**解決方法**:
```bash
# 状態ファイルを削除
rm .publish-state.json

# 最初から再実行
package-publisher publish
```

### デバッグモード

詳細なログを確認する場合：

```bash
# 環境変数でデバッグモード有効化
DEBUG=package-publisher:* package-publisher publish
```

## セキュリティベストプラクティス

### 1. トークン管理

❌ **悪い例**:
```javascript
// ハードコード（絶対にしない）
const token = "npm_abc123xyz..."
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
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Publish to npm
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          npm install -g package-publisher
          package-publisher publish --non-interactive --registry npm
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
npm view my-package@$(node -p "require('./package.json').version")

echo "✅ Publish workflow completed"
```

### 複数レジストリへの公開

```bash
# npmとnpm registryに同時公開
package-publisher publish --registry npm

# Homebrewの場合は別途Tap更新が必要
cd ~/homebrew-tap
git pull
package-publisher publish --registry homebrew
```

## 関連ドキュメント

- [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md) - カスタムプラグイン開発
- [Security Policy](../SECURITY.md) - セキュリティポリシー
- [Contributing Guide](../CONTRIBUTING.md) - 貢献ガイド

## サポート

- **Issues**: https://github.com/sanae-abe/package-publisher/issues
- **Discussions**: https://github.com/sanae-abe/package-publisher/discussions

---

**Last Updated**: 2025-01-10
**Version**: 0.1.0
