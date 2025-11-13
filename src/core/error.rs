//! Error handling for package publishing
//!
//! This module provides comprehensive error types with recovery guidance
//! using the thiserror crate for ergonomic error handling.

use thiserror::Error;

/// Main error type for package publishing operations
#[derive(Error, Debug)]
pub enum PublishError {
    // Detection errors
    #[error("[{registry}] レジストリが検出されませんでした")]
    RegistryNotDetected { registry: String },

    // Validation errors
    #[error("[{registry}] パッケージの検証に失敗しました")]
    ValidationFailed { registry: String },

    #[error("[{registry}] 無効なバージョン番号です")]
    InvalidVersion { registry: String },

    #[error("[{registry}] 必須のメタデータが不足しています")]
    MissingMetadata { registry: String },

    // Security errors
    #[error("[{registry}] ハードコードされた機密情報が検出されました")]
    SecretsDetected { registry: String },

    #[error("[{registry}] 認証トークンが設定されていません")]
    TokenMissing { registry: String },

    #[error("[{registry}] 認証に失敗しました")]
    AuthenticationFailed { registry: String },

    // Publishing errors
    #[error("[{registry}] 公開処理に失敗しました: {message}")]
    PublishFailed { registry: String, message: String },

    #[error("[{registry}] 同じバージョンが既に公開されています")]
    VersionConflict { registry: String },

    #[error("[{registry}] 2要素認証が必要です")]
    OtpRequired { registry: String },

    // Network errors
    #[error("[{registry}] ネットワークエラーが発生しました: {message}")]
    NetworkError { registry: String, message: String },

    #[error("[{registry}] タイムアウトしました")]
    TimeoutError { registry: String },

    // Verification errors
    #[error("[{registry}] 公開の検証に失敗しました")]
    VerificationFailed { registry: String },

    // State errors
    #[error("[{registry}] 状態ファイルが破損しています")]
    StateCorrupted { registry: String },

    // Rollback errors
    #[error("[{registry}] ロールバックに失敗しました")]
    RollbackFailed { registry: String },

    #[error("[{registry}] このレジストリはロールバックをサポートしていません")]
    RollbackNotSupported { registry: String },

    // Command execution errors
    #[error("[{registry}] コマンド実行エラー: {message}")]
    CommandError { registry: String, message: String },
}

impl PublishError {
    /// Get the registry name associated with this error
    pub fn registry(&self) -> &str {
        match self {
            Self::RegistryNotDetected { registry }
            | Self::ValidationFailed { registry }
            | Self::InvalidVersion { registry }
            | Self::MissingMetadata { registry }
            | Self::SecretsDetected { registry }
            | Self::TokenMissing { registry }
            | Self::AuthenticationFailed { registry }
            | Self::PublishFailed { registry, .. }
            | Self::VersionConflict { registry }
            | Self::OtpRequired { registry }
            | Self::NetworkError { registry, .. }
            | Self::TimeoutError { registry }
            | Self::VerificationFailed { registry }
            | Self::StateCorrupted { registry }
            | Self::RollbackFailed { registry }
            | Self::RollbackNotSupported { registry }
            | Self::CommandError { registry, .. } => registry,
        }
    }

    /// Check if this error is recoverable
    pub fn is_recoverable(&self) -> bool {
        !matches!(
            self,
            Self::RegistryNotDetected { .. }
                | Self::RollbackFailed { .. }
                | Self::RollbackNotSupported { .. }
        )
    }

    /// Get suggested actions for this error
    pub fn suggested_actions(&self) -> Vec<&'static str> {
        match self {
            Self::RegistryNotDetected { .. } => vec![
                "プロジェクトディレクトリを確認してください",
                "対応するパッケージマネージャーがインストールされているか確認してください",
            ],
            Self::ValidationFailed { .. } => {
                vec!["検証エラーを確認してください", "メタデータを修正してください"]
            }
            Self::InvalidVersion { .. } => {
                vec!["SemVer形式（例: 1.0.0）で指定してください"]
            }
            Self::MissingMetadata { .. } => {
                vec!["package.json/Cargo.toml等を確認してください"]
            }
            Self::SecretsDetected { .. } => vec![
                "検出されたファイルを確認してください",
                "環境変数の使用を推奨します",
                ".gitignoreに追加してください",
            ],
            Self::TokenMissing { .. } => {
                vec!["環境変数を設定してください（例: NPM_TOKEN, CARGO_REGISTRY_TOKEN）"]
            }
            Self::AuthenticationFailed { .. } => vec![
                "認証情報を確認してください",
                "環境変数が正しく設定されているか確認してください",
                "トークンの有効期限を確認してください",
            ],
            Self::PublishFailed { .. } => vec![
                "エラーメッセージを確認してください",
                "ネットワーク接続を確認してください",
                "レジストリのステータスを確認してください",
            ],
            Self::VersionConflict { .. } => vec![
                "バージョン番号を更新してください",
                "npm version patch/minor/majorを実行してください",
            ],
            Self::OtpRequired { .. } => {
                vec!["--otpオプションでワンタイムパスワードを指定してください"]
            }
            Self::NetworkError { .. } => vec![
                "インターネット接続を確認してください",
                "しばらく待ってから再試行してください",
            ],
            Self::TimeoutError { .. } => vec![
                "ネットワーク環境を確認してください",
                "--timeoutオプションで時間を延長できます",
            ],
            Self::VerificationFailed { .. } => vec![
                "レジストリのWebサイトで手動確認してください",
                "しばらく待ってから再試行してください（反映に時間がかかる場合があります）",
            ],
            Self::StateCorrupted { .. } => {
                vec![".publish-state.jsonを削除して再試行してください"]
            }
            Self::RollbackFailed { .. } => vec![
                "レジストリのドキュメントを確認してください",
                "手動でロールバックが必要な場合があります",
            ],
            Self::RollbackNotSupported { .. } => {
                vec!["新しいバージョンで修正版を公開してください"]
            }
            Self::CommandError { .. } => vec![
                "コマンドの出力を確認してください",
                "必要な依存関係がインストールされているか確認してください",
            ],
        }
    }

    /// Get error code for this error
    pub fn code(&self) -> &'static str {
        match self {
            Self::RegistryNotDetected { .. } => "REGISTRY_NOT_DETECTED",
            Self::ValidationFailed { .. } => "VALIDATION_FAILED",
            Self::InvalidVersion { .. } => "INVALID_VERSION",
            Self::MissingMetadata { .. } => "MISSING_METADATA",
            Self::SecretsDetected { .. } => "SECRETS_DETECTED",
            Self::TokenMissing { .. } => "TOKEN_MISSING",
            Self::AuthenticationFailed { .. } => "AUTHENTICATION_FAILED",
            Self::PublishFailed { .. } => "PUBLISH_FAILED",
            Self::VersionConflict { .. } => "VERSION_CONFLICT",
            Self::OtpRequired { .. } => "OTP_REQUIRED",
            Self::NetworkError { .. } => "NETWORK_ERROR",
            Self::TimeoutError { .. } => "TIMEOUT_ERROR",
            Self::VerificationFailed { .. } => "VERIFICATION_FAILED",
            Self::StateCorrupted { .. } => "STATE_CORRUPTED",
            Self::RollbackFailed { .. } => "ROLLBACK_FAILED",
            Self::RollbackNotSupported { .. } => "ROLLBACK_NOT_SUPPORTED",
            Self::CommandError { .. } => "COMMAND_ERROR",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_not_detected_error() {
        let error = PublishError::RegistryNotDetected {
            registry: "npm".to_string(),
        };

        assert_eq!(error.registry(), "npm");
        assert!(!error.is_recoverable());
        assert_eq!(error.code(), "REGISTRY_NOT_DETECTED");
        assert!(error.suggested_actions().len() > 0);
    }

    #[test]
    fn test_validation_failed_error() {
        let error = PublishError::ValidationFailed {
            registry: "crates-io".to_string(),
        };

        assert_eq!(error.registry(), "crates-io");
        assert!(error.is_recoverable());
        assert_eq!(error.code(), "VALIDATION_FAILED");
    }

    #[test]
    fn test_publish_failed_error_with_message() {
        let error = PublishError::PublishFailed {
            registry: "pypi".to_string(),
            message: "Connection refused".to_string(),
        };

        assert_eq!(error.registry(), "pypi");
        assert!(error.is_recoverable());
        assert_eq!(error.code(), "PUBLISH_FAILED");
        let error_msg = error.to_string();
        assert!(error_msg.contains("Connection refused"));
    }

    #[test]
    fn test_secrets_detected_error() {
        let error = PublishError::SecretsDetected {
            registry: "npm".to_string(),
        };

        assert_eq!(error.code(), "SECRETS_DETECTED");
        assert!(error.is_recoverable());
        let actions = error.suggested_actions();
        assert!(actions.len() >= 3);
        assert!(actions.contains(&"環境変数の使用を推奨します"));
    }

    #[test]
    fn test_token_missing_error() {
        let error = PublishError::TokenMissing {
            registry: "crates-io".to_string(),
        };

        assert!(error.is_recoverable());
        let actions = error.suggested_actions();
        assert!(actions.iter().any(|&a| a.contains("環境変数")));
    }

    #[test]
    fn test_authentication_failed_error() {
        let error = PublishError::AuthenticationFailed {
            registry: "npm".to_string(),
        };

        assert_eq!(error.code(), "AUTHENTICATION_FAILED");
        assert!(error.is_recoverable());
    }

    #[test]
    fn test_version_conflict_error() {
        let error = PublishError::VersionConflict {
            registry: "npm".to_string(),
        };

        assert!(error.is_recoverable());
        let actions = error.suggested_actions();
        assert!(actions.iter().any(|&a| a.contains("バージョン番号")));
    }

    #[test]
    fn test_otp_required_error() {
        let error = PublishError::OtpRequired {
            registry: "npm".to_string(),
        };

        assert_eq!(error.code(), "OTP_REQUIRED");
        assert!(error.is_recoverable());
    }

    #[test]
    fn test_network_error_with_message() {
        let error = PublishError::NetworkError {
            registry: "crates-io".to_string(),
            message: "ECONNREFUSED".to_string(),
        };

        assert_eq!(error.code(), "NETWORK_ERROR");
        assert!(error.is_recoverable());
    }

    #[test]
    fn test_timeout_error() {
        let error = PublishError::TimeoutError {
            registry: "pypi".to_string(),
        };

        assert!(error.is_recoverable());
        assert_eq!(error.code(), "TIMEOUT_ERROR");
    }

    #[test]
    fn test_verification_failed_error() {
        let error = PublishError::VerificationFailed {
            registry: "npm".to_string(),
        };

        assert_eq!(error.code(), "VERIFICATION_FAILED");
        assert!(error.is_recoverable());
    }

    #[test]
    fn test_rollback_not_supported_error() {
        let error = PublishError::RollbackNotSupported {
            registry: "crates-io".to_string(),
        };

        assert!(!error.is_recoverable());
        assert_eq!(error.code(), "ROLLBACK_NOT_SUPPORTED");
    }

    #[test]
    fn test_command_error() {
        let error = PublishError::CommandError {
            registry: "npm".to_string(),
            message: "npm not found".to_string(),
        };

        assert_eq!(error.registry(), "npm");
        assert_eq!(error.code(), "COMMAND_ERROR");
    }

    #[test]
    fn test_error_display() {
        let error = PublishError::ValidationFailed {
            registry: "test-registry".to_string(),
        };

        let display = format!("{}", error);
        assert!(display.contains("test-registry"));
        assert!(display.contains("検証に失敗"));
    }
}
