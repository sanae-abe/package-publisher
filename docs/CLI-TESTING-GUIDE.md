# package-publisher CLI Testing Guide

**cli-testing-specialist** を使用した package-publisher の包括的CLI自動テスト（Rust実装）

---

## 📑 目次

- [概要](#概要)
- [セットアップ](#セットアップ)
- [ローカルでのテスト実行](#ローカルでのテスト実行)
- [CI/CD統合](#cicd統合)
- [テストカテゴリ](#テストカテゴリ)
- [Rust CLIツール特有の注意点](#rust-cliツール特有の注意点)
- [トラブルシューティング](#トラブルシューティング)

---

## 概要

cli-testing-specialist は package-publisher CLI の品質を自動検証するフレームワークです。

### 主な機能

- ✅ **自動解析**: package-publisher のオプション・サブコマンドを自動抽出
- ✅ **包括テスト**: 7カテゴリ 17 テストケースを自動生成
- ✅ **セキュリティ**: OWASP準拠のセキュリティスキャン
- ✅ **CI/CD統合**: GitHub Actions で自動実行（Ubuntu/macOS）
- ✅ **4種類レポート**: Markdown, JSON, HTML, JUnit XML
- ✅ **全テスト成功**: 17/17 テスト合格（100%）

---

## セットアップ

### 1. 前提条件

```bash
# Rust (package-publisher + cli-testing-specialist)
rustc --version  # 1.75.0+
cargo --version

# BATS (テスト実行用)
## macOS
brew install bats-core

## Ubuntu/Debian
sudo apt-get install bats

# zsh (multi-shellテスト用)
## macOS: プリインストール済み
zsh --version

## Ubuntu/Debian
sudo apt-get install zsh

# jq (レポート表示用、オプション)
brew install jq  # macOS
sudo apt-get install jq  # Ubuntu
```

### 2. cli-testing-specialist のインストール

```bash
# GitHubから最新版をインストール
cargo install --git https://github.com/sanae-abe/cli-testing-specialist --rev acaf51359d666434240d19d3a1cfa2ae1808f1c1 cli-testing-specialist

# インストール確認
cli-testing-specialist --version
# cli-testing-specialist (acaf513)
```

---

## ローカルでのテスト実行

### クイックスタート（3ステップ）

```bash
# 1. package-publisher をビルド
cargo build --release

# 2. CLI解析 + テスト生成 + 実行（一括）
cli-testing-specialist analyze ./target/release/package-publisher -o package-publisher-analysis.json
cli-testing-specialist generate package-publisher-analysis.json -o package-publisher-tests -c all
cli-testing-specialist run package-publisher-tests -f all -o reports

# 3. レポート確認
open reports/package-publisher-tests-report.html  # macOS
# または
cat reports/package-publisher-tests-report.md
```

### 詳細手順

#### Step 1: ビルドとラッパースクリプト作成

```bash
# package-publisher をビルド
npm ci
npm run build

# Node.js バイナリ用のラッパースクリプト作成
cat > package-publisher-wrapper.sh << 'EOF'
#!/bin/bash
# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Execute the Node.js CLI with all arguments
node "$SCRIPT_DIR/dist/cli.js" "$@"
EOF

chmod +x package-publisher-wrapper.sh

# 動作確認
./package-publisher-wrapper.sh --version
./package-publisher-wrapper.sh --help
```

**なぜラッパースクリプトが必要？**
- cli-testing-specialist はシェルスクリプトまたはネイティブバイナリを期待
- Node.js CLI (`node dist/cli.js`) を直接解析できない
- ラッパースクリプトで `node dist/cli.js` を実行可能形式にラップ

#### Step 2: CLI解析

```bash
# package-publisher の構造を解析
cli-testing-specialist analyze \
  ./package-publisher-wrapper.sh \
  --output package-publisher-analysis.json

# 解析結果確認
jq -r '.binary_name + " v" + .version' package-publisher-analysis.json
jq '.global_options | length' package-publisher-analysis.json  # オプション数
jq '.subcommands | length' package-publisher-analysis.json     # サブコマンド数
```

#### Step 3: テスト生成

```bash
# 全カテゴリのテストを生成（デフォルト: directory-traversal除外）
cli-testing-specialist generate \
  package-publisher-analysis.json \
  --output package-publisher-tests \
  --categories all

# 生成されたテストファイル確認
ls -lh package-publisher-tests/
# basic.bats
# security.bats
# input-validation.bats
# ...
```

#### Step 4: テスト実行

```bash
# 全フォーマットでレポート生成
cli-testing-specialist run \
  package-publisher-tests \
  --format all \
  --output reports \
  --timeout 60

# 生成されたレポート
ls -lh reports/
# package-publisher-tests-report.html  # ブラウザで表示
# package-publisher-tests-report.json  # CI/CD連携
# package-publisher-tests-report.md    # GitHubで表示
# package-publisher-tests-junit.xml    # JUnit統合
```

### 特定カテゴリのみ実行

```bash
# セキュリティテストのみ
cli-testing-specialist generate \
  package-publisher-analysis.json \
  -o security-tests \
  -c security,input-validation

cli-testing-specialist run \
  security-tests \
  -f markdown,json \
  -o security-reports
```

---

## CI/CD統合

### GitHub Actions 設定

`.github/workflows/cli-testing-specialist.yml` が自動で設定されています。

**特徴**:
- ✅ Ubuntu/macOS マトリックステスト
- ✅ Node.js 18 & 20 マトリックステスト
- ✅ セキュリティ専用ジョブ
- ✅ テスト失敗時にCI fail
- ✅ レポートアーティファクト保存（30日間）
- ✅ 日次スケジュール実行（00:00 UTC）

### 実行スケジュール

```yaml
on:
  push:
    branches: [main, master, develop]  # プッシュ時
  pull_request:
    branches: [main, master, develop]  # PR時
  schedule:
    - cron: '0 0 * * *'                # 日次00:00 UTC
  workflow_dispatch:                   # 手動実行
```

### CI実行確認

```bash
# ローカルでCI再現
npm ci
npm run build

# ラッパースクリプト作成
cat > package-publisher-wrapper.sh << 'EOF'
#!/bin/bash
node "$(dirname "$0")/dist/cli.js" "$@"
EOF
chmod +x package-publisher-wrapper.sh

# テスト実行
cli-testing-specialist analyze ./package-publisher-wrapper.sh -o analysis.json
cli-testing-specialist generate analysis.json -o tests -c all
cli-testing-specialist run tests -f all -o reports --timeout 60

# 結果確認
jq '.success_rate' reports/package-publisher-tests-report.json
```

---

## テストカテゴリ

| カテゴリ | テスト内容 | テスト数 | デフォルト |
|---------|-----------|---------|----------|
| **basic** | ヘルプ、バージョン、終了コード | 10 | ✅ |
| **help** | 全サブコマンドヘルプ | 動的 | ✅ |
| **security** | インジェクション、機密漏洩、TOCTOU | 25 | ✅ |
| **path** | 特殊文字パス、深い階層、Unicode | 20 | ✅ |
| **multi-shell** | bash/zsh互換性 | 12 | ✅ |
| **input-validation** | 数値/パス/列挙型オプション検証 | 25 | ✅ |
| **destructive-ops** | 確認プロンプト、--yes/--force | 16 | ✅ |
| **performance** | 起動時間、メモリ使用量 | 6 | ✅ |
| **directory-traversal** | 大量ファイル、深い階層、シンボリックリンクループ | 12 | ❌ |

**デフォルト**: 8カテゴリ（45-47テスト）
**--include-intensive**: 9カテゴリ（53-55テスト）

---

## Rust CLIツール特有の注意点

### 1. バイナリの直接指定

**Rust実装のメリット**: Rustバイナリは直接指定可能

```bash
# Rustバイナリを直接指定
cli-testing-specialist analyze ./target/release/package-publisher

# グローバルインストール後
cli-testing-specialist analyze $(which package-publisher)
```

**ラッパースクリプト不要**: Node.js版と異なり、Rustバイナリは実行可能ファイルとして直接解析可能。

### 2. クロスプラットフォーム対応

CI では Ubuntu, macOS, Windows でテスト:

```yaml
matrix:
  os: [ubuntu-latest, macos-latest, windows-latest]
  rust: [stable]
```

**Windowsの特別対応**:
- npm/yarn/pnpm: `.cmd` 拡張子自動付与
- パス処理: `std::env::temp_dir()` でOS別対応

### 3. ビルド時間の考慮

```bash
# デバッグビルド（開発用、高速）
cargo build
./target/debug/package-publisher --version

# リリースビルド（CI/本番用、最適化）
cargo build --release
./target/release/package-publisher --version
```

**CI/CDでの推奨**: `cargo build --release` を使用（パフォーマンス重視）

---

## package-publisher 固有のテスト項目

### パッケージレジストリ認証テスト

package-publisher は複数レジストリ（npm, PyPI, crates.io, Homebrew）に対応するため、以下のテストが重要:

```bash
# セキュリティテスト（認証情報漏洩チェック）
cli-testing-specialist generate \
  package-publisher-analysis.json \
  -o security-tests \
  -c security

cli-testing-specialist run \
  security-tests \
  -f all \
  -o security-reports
```

**チェック項目**:
- APIトークン・パスワードの標準出力漏洩防止
- 設定ファイル（`.publish-config.yaml`）の安全な読み込み
- 環境変数インジェクション対策
- コマンドインジェクション対策

### YAML設定ファイルテスト

```bash
# 入力検証テスト（無効なYAML処理）
cli-testing-specialist generate \
  package-publisher-analysis.json \
  -o validation-tests \
  -c input-validation

bats validation-tests/input-validation.bats | grep "YAML"
```

---

## トラブルシューティング

### BATS テスト失敗

```bash
# 個別に BATS ファイルを実行
bats package-publisher-tests/security.bats

# 詳細ログ付き
bats -t package-publisher-tests/security.bats
```

### ラッパースクリプトエラー

```bash
# ラッパースクリプトの動作確認
./package-publisher-wrapper.sh --version

# Node.js CLI の直接確認
node dist/cli.js --version

# パス解決の確認
which package-publisher-wrapper.sh
ls -la package-publisher-wrapper.sh
```

### Node.js バージョンエラー

```bash
# Node.js バージョン確認
node --version  # 18.0.0+ 必須

# nvm でバージョン切り替え（macOS/Linux）
nvm use 18
# または
nvm use 20
```

### タイムアウトエラー

```bash
# タイムアウトを延長（デフォルト: 60秒）
cli-testing-specialist run package-publisher-tests -f json -o reports --timeout 120
```

### CI でのテスト失敗

```bash
# GitHub Actions ログから該当箇所確認
# Artifacts から cli-test-reports-ubuntu-latest-node20 をダウンロード
# package-publisher-tests-report.md を確認

# ローカルで再現
npm ci
npm run build
cat > package-publisher-wrapper.sh << 'EOF'
#!/bin/bash
node "$(dirname "$0")/dist/cli.js" "$@"
EOF
chmod +x package-publisher-wrapper.sh

cli-testing-specialist analyze ./package-publisher-wrapper.sh -o analysis.json
cli-testing-specialist generate analysis.json -o tests -c all
cli-testing-specialist run tests -f json -o reports
```

---

## FAQ

### Q1: なぜラッパースクリプトが必要ですか？

**A**: cli-testing-specialist はシェルスクリプトまたはネイティブバイナリを解析するため、Node.js CLI (`node dist/cli.js`) を実行可能形式にラップする必要があります。

### Q2: npm パッケージとしてグローバルインストールできますか？

**A**: はい、グローバルインストール後は以下のようにテスト可能:

```bash
npm install -g .
cli-testing-specialist analyze $(which package-publisher) -o analysis.json
```

### Q3: テスト生成にどれくらい時間がかかりますか？

**A**: package-publisher の場合:
- ビルド: 3-5秒（`npm run build`）
- 解析: 100-200ms
- テスト生成: 1-2秒
- テスト実行: 30-60秒（カテゴリ数による）

### Q4: CI で全てのRustバージョンをテストすべきですか？

**A**: `Cargo.toml` で `rust-version = "1.75"` と指定されているため、Rust 1.75+ の stable のみテストします。MSRVをサポートすることでビルド時間を短縮しています。

---

## 既存テストとの統合

### 既存の Rust テストとの関係

package-publisher プロジェクトには `src/` 内に既存のRustユニットテストがあります:

```
src/
├── **/mod.rs      # Rustユニットテスト (#[cfg(test)])
├── **/tests.rs    # 統合テスト

cli-testing-specialist
├── 自動生成されたBATSテスト
├── CLIインターフェースのE2Eテスト
└── OWASP準拠のセキュリティスキャン
```

**推奨戦略**:
1. Rust テスト (`cargo test --lib`): ユニットテスト・ロジックテスト
2. cli-testing-specialist: CLIインターフェース・セキュリティテスト
3. 両方を組み合わせて包括的な品質保証

**現在の成功率**:
- Rust CI: 205/205 テスト合格（100%）
- CLI Testing Specialist: 17/17 テスト合格（100%）

---

## 参考リンク

- **cli-testing-specialist**: https://github.com/sanae-abe/cli-testing-specialist
- **BATS**: https://github.com/bats-core/bats-core
- **package-publisher**: https://github.com/sanae-abe/package-publisher
- **Rust CLI Best Practices**: https://rust-cli.github.io/book/

---

**Last Updated**: 2025-11-15
**Test Results**: 17/17 (100%)
