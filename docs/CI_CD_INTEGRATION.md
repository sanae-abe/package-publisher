# CI/CD Integration Guide

このドキュメントでは、`package-publisher`（Rust実装）を主要なCI/CDプラットフォームと統合する方法を説明します。

## 📋 目次

- [GitHub Actions](#github-actions)
- [GitLab CI/CD](#gitlab-cicd)
- [CircleCI](#circleci)
- [Secrets管理](#secrets管理)
- [セキュリティベストプラクティス](#セキュリティベストプラクティス)
- [トラブルシューティング](#トラブルシューティング)

---

## GitHub Actions

### 単一レジストリへの公開（npm）

`.github/workflows/publish-npm.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-npm:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache Rust dependencies
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

      - name: Build package-publisher
        run: cargo build --release

      - name: Run tests
        run: cargo test --lib

      - name: Publish to npm
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          ./target/release/package-publisher publish \
            --registry npm \
            --non-interactive \
            --tag latest \
            --access public
```

### 複数レジストリへの公開

`.github/workflows/publish-multiregistry.yml`:

```yaml
name: Publish to Multiple Registries

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-multiregistry:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache Rust dependencies
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

      - name: Build package-publisher
        run: cargo build --release

      - name: Run tests
        run: cargo test --lib

      - name: Publish to multiple registries
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          PYPI_TOKEN: ${{ secrets.PYPI_TOKEN }}
          CARGO_REGISTRY_TOKEN: ${{ secrets.CARGO_REGISTRY_TOKEN }}
        run: |
          ./target/release/package-publisher publish \
            --registries npm,pypi,crates.io \
            --non-interactive \
            --continue-on-error
```

### Secrets設定

1. リポジトリの **Settings** > **Secrets and variables** > **Actions**
2. **New repository secret** をクリック
3. 以下のSecretsを追加：

| Name | Value | 用途 |
|------|-------|------|
| `NPM_TOKEN` | npm access token (Automation型) | npm公開用 |
| `PYPI_TOKEN` | PyPI API token | PyPI公開用 |
| `CARGO_REGISTRY_TOKEN` | crates.io token | crates.io公開用 |

### 環境保護（推奨）

1. **Settings** > **Environments** > **New environment**
2. 環境名: `production`
3. **Required reviewers** を設定（オプション）
4. **Deployment branches** で `v*` タグのみ許可

---

## GitLab CI/CD

### 基本設定

`.gitlab-ci.yml`:

```yaml
workflow:
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/

stages:
  - test
  - build
  - publish

test:
  stage: test
  image: rust:latest
  script:
    - cargo test --lib

build:
  stage: build
  image: rust:latest
  script:
    - cargo build --release
  artifacts:
    paths:
      - target/release/package-publisher

publish:npm:
  stage: publish
  image: rust:latest
  environment:
    name: production
  script:
    - cargo build --release
    - |
      ./target/release/package-publisher publish \
        --registry npm \
        --non-interactive \
        --tag latest
```

### Variables設定

1. **Settings** > **CI/CD** > **Variables**
2. **Add variable** をクリック
3. 以下を設定：

| Key | Value | Flags |
|-----|-------|-------|
| `NPM_TOKEN` | npm access token | Protected, Masked |
| `PYPI_TOKEN` | PyPI API token | Protected, Masked |
| `CARGO_REGISTRY_TOKEN` | crates.io token | Protected, Masked |

### プロテクトされたタグ

1. **Settings** > **Repository** > **Protected tags**
2. Tag: `v*`
3. **Allowed to create**: Maintainers

---

## CircleCI

### 基本設定

`.circleci/config.yml`:

```yaml
version: 2.1

executors:
  rust-executor:
    docker:
      - image: rust:latest

jobs:
  test:
    executor: rust-executor
    steps:
      - checkout
      - restore_cache:
          keys:
            - cargo-cache-{{ checksum "Cargo.lock" }}
      - run: cargo test --lib
      - save_cache:
          key: cargo-cache-{{ checksum "Cargo.lock" }}
          paths:
            - ~/.cargo

  publish:
    executor: rust-executor
    steps:
      - checkout
      - restore_cache:
          keys:
            - cargo-cache-{{ checksum "Cargo.lock" }}
      - run: cargo build --release
      - run: |
          ./target/release/package-publisher publish \
            --registry npm \
            --non-interactive

workflows:
  publish-on-tag:
    jobs:
      - test:
          filters:
            tags:
              only: /^v\d+\.\d+\.\d+$/
      - publish:
          context: publishing
          requires:
            - test
          filters:
            tags:
              only: /^v\d+\.\d+\.\d+$/
            branches:
              ignore: /.*/
```

### Context設定

1. **Organization Settings** > **Contexts**
2. **Create Context**: `publishing`
3. 環境変数を追加：

| Name | Value |
|------|-------|
| `NPM_TOKEN` | npm access token |
| `NODE_AUTH_TOKEN` | npm access token（npmと同じ） |

---

## Secrets管理

### トークンの種類と推奨設定

#### npm

```bash
# Automation tokenを作成（推奨）
npm token create --type=automation

# 環境変数に設定
export NPM_TOKEN="npm_xxx..."
```

**権限**: Publish (read-write)

#### PyPI

```bash
# API tokenを作成
# https://pypi.org/manage/account/token/

export PYPI_TOKEN="pypi-xxx..."
export TWINE_USERNAME="__token__"
export TWINE_PASSWORD="$PYPI_TOKEN"
```

**スコープ**: プロジェクト単位（推奨）

#### crates.io

```bash
# https://crates.io/settings/tokens でtokenを作成

export CARGO_REGISTRY_TOKEN="xxx..."
```

**権限**: publish-update

### 環境変数の設定

package-publisherは以下の環境変数を自動的に認識します：

```bash
# npm
export NPM_TOKEN="npm_xxx..."
export NODE_AUTH_TOKEN="npm_xxx..."

# PyPI
export PYPI_TOKEN="pypi-xxx..."
export TWINE_USERNAME="__token__"
export TWINE_PASSWORD="pypi-xxx..."

# crates.io
export CARGO_REGISTRY_TOKEN="xxx..."
```

---

## セキュリティベストプラクティス

### 1. トークンの最小権限原則

✅ **推奨**:
- Automation型のトークン（npm）
- プロジェクト単位のスコープ（PyPI）
- publish-update権限のみ（crates.io）

❌ **非推奨**:
- ユーザーアカウントの全権限トークン
- organization全体のスコープ
- 不要な権限の付与

### 2. Secrets保護

✅ **必須対策**:
- すべてのSecretsに `Masked` フラグ
- `Protected` タグ/ブランチのみで使用
- 環境保護（Environment Protection）の活用
- 定期的なトークンローテーション

❌ **避けるべき**:
- コードへのハードコード
- ログへの出力
- 不要なスコープでの使用

### 3. 承認フロー

本番環境への公開前に承認を要求：

**GitHub Actions**:
```yaml
environment:
  name: production
```

**GitLab CI**:
```yaml
environment:
  name: production
  action: prepare
```

**CircleCI**:
```yaml
- hold-for-approval:
    type: approval
```

### 4. 監査ログ

定期的にPublish履歴を確認：

```bash
# npm
npm audit log

# PyPI
# https://pypi.org/manage/projects/ で確認

# crates.io
# https://crates.io/me で確認
```

---

## トラブルシューティング

### 認証エラー

**症状**:
```
Error: Authentication failed
```

**解決方法**:
1. トークンが正しく設定されているか確認
2. トークンの有効期限を確認
3. 環境変数名が正しいか確認（`NPM_TOKEN` vs `NODE_AUTH_TOKEN`）

```bash
# 確認方法
echo $NPM_TOKEN  # トークンが設定されているか
npm whoami       # npmにログインできるか
```

### タイムアウトエラー

**症状**:
```
Error: Timeout waiting for registry
```

**解決方法**:
1. ネットワーク設定を確認
2. レジストリのステータスを確認
3. タイムアウト時間を延長

```yaml
# Hooksでタイムアウト設定
hooks:
  prePublish:
    - command: "npm run build"
      timeout: 600  # 10分
```

### 公開失敗後の再試行

**バッチ公開モード**:
```bash
# エラー時も継続
package-publisher publish \
  --registries npm,pypi,crates.io \
  --continue-on-error

# 失敗したレジストリのみ再試行
package-publisher publish \
  --registries pypi  # 失敗したレジストリ のみ
```

### 検証エラー

**症状**:
```
Warning: Verification failed
```

**対処法**:
1. レジストリへの反映に時間がかかる場合がある（数分待機）
2. 手動で確認:

```bash
# npm
npm view package-name@1.2.3

# PyPI
pip index versions package-name

# crates.io
cargo search package-name
```

---

## 参考リンク

### 公式ドキュメント

- [GitHub Actions](https://docs.github.com/en/actions)
- [GitLab CI/CD](https://docs.gitlab.com/ee/ci/)
- [CircleCI](https://circleci.com/docs/)

### レジストリドキュメント

- [npm](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages)
- [PyPI](https://packaging.python.org/en/latest/tutorials/packaging-projects/)
- [crates.io](https://doc.rust-lang.org/cargo/reference/publishing.html)

### セキュリティガイド

- [GitHub Security Best Practices](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [GitLab CI/CD Security](https://docs.gitlab.com/ee/ci/pipelines/pipeline_security.html)
- [CircleCI Security](https://circleci.com/docs/security/)

---

## サポート

問題が発生した場合は、[Issues](https://github.com/your-org/package-publisher/issues)で報告してください。
