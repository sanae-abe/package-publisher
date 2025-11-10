/**
 * Standardized error handling for package-publisher
 */

export class PublishError extends Error {
  constructor(
    public code: string,
    public registry: string,
    message: string,
    public recoverable: boolean = false,
    public suggestedActions?: string[]
  ) {
    super(message)
    this.name = 'PublishError'
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Error codes with standardized messages and recovery actions
 */
export const ErrorCodes = {
  // Detection errors
  REGISTRY_NOT_DETECTED: {
    message: 'レジストリが検出されませんでした',
    recoverable: false,
    actions: [
      'プロジェクトディレクトリを確認してください',
      '対応するパッケージマネージャーがインストールされているか確認してください'
    ]
  },

  // Validation errors
  VALIDATION_FAILED: {
    message: 'パッケージの検証に失敗しました',
    recoverable: true,
    actions: ['検証エラーを確認してください', 'メタデータを修正してください']
  },
  INVALID_VERSION: {
    message: '無効なバージョン番号です',
    recoverable: true,
    actions: ['SemVer形式（例: 1.0.0）で指定してください']
  },
  MISSING_METADATA: {
    message: '必須のメタデータが不足しています',
    recoverable: true,
    actions: ['package.json/Cargo.toml等を確認してください']
  },

  // Security errors
  SECRETS_DETECTED: {
    message: 'ハードコードされた機密情報が検出されました',
    recoverable: true,
    actions: [
      '検出されたファイルを確認してください',
      '環境変数の使用を推奨します',
      '.gitignoreに追加してください'
    ]
  },
  TOKEN_MISSING: {
    message: '認証トークンが設定されていません',
    recoverable: true,
    actions: ['環境変数を設定してください（例: NPM_TOKEN, CARGO_REGISTRY_TOKEN）']
  },

  // Publishing errors
  PUBLISH_FAILED: {
    message: '公開処理に失敗しました',
    recoverable: true,
    actions: [
      'エラーメッセージを確認してください',
      'ネットワーク接続を確認してください',
      'レジストリのステータスを確認してください'
    ]
  },
  VERSION_CONFLICT: {
    message: '同じバージョンが既に公開されています',
    recoverable: true,
    actions: ['バージョン番号を更新してください', 'npm version patch/minor/majorを実行してください']
  },
  OTP_REQUIRED: {
    message: '2要素認証が必要です',
    recoverable: true,
    actions: ['--otpオプションでワンタイムパスワードを指定してください']
  },

  // Network errors
  NETWORK_ERROR: {
    message: 'ネットワークエラーが発生しました',
    recoverable: true,
    actions: ['インターネット接続を確認してください', 'しばらく待ってから再試行してください']
  },
  TIMEOUT_ERROR: {
    message: 'タイムアウトしました',
    recoverable: true,
    actions: ['ネットワーク環境を確認してください', '--timeoutオプションで時間を延長できます']
  },

  // Verification errors
  VERIFICATION_FAILED: {
    message: '公開の検証に失敗しました',
    recoverable: true,
    actions: [
      'レジストリのWebサイトで手動確認してください',
      'しばらく待ってから再試行してください（反映に時間がかかる場合があります）'
    ]
  },

  // State errors
  STATE_CORRUPTED: {
    message: '状態ファイルが破損しています',
    recoverable: true,
    actions: ['.publish-state.jsonを削除して再試行してください']
  },

  // Rollback errors
  ROLLBACK_FAILED: {
    message: 'ロールバックに失敗しました',
    recoverable: false,
    actions: [
      'レジストリのドキュメントを確認してください',
      '手動でロールバックが必要な場合があります'
    ]
  },
  ROLLBACK_NOT_SUPPORTED: {
    message: 'このレジストリはロールバックをサポートしていません',
    recoverable: false,
    actions: ['新しいバージョンで修正版を公開してください']
  }
} as const

/**
 * Error factory for creating standardized errors
 */
export class ErrorFactory {
  static create(
    errorCode: keyof typeof ErrorCodes,
    registry: string,
    message?: string,
    ...actionArgs: any[]
  ): PublishError {
    const errorDef = ErrorCodes[errorCode]
    const finalMessage = message || errorDef.message

    // Format suggested actions with arguments
    const actions = errorDef.actions.map((action) => {
      return actionArgs.length > 0 ? this.formatAction(action, actionArgs) : action
    })

    return new PublishError(
      errorCode,
      registry,
      `[${registry}] ${finalMessage}`,
      errorDef.recoverable,
      actions
    )
  }

  private static formatAction(action: string, args: any[]): string {
    let formatted = action
    args.forEach((arg, index) => {
      formatted = formatted.replace(`{${index}}`, String(arg))
    })
    return formatted
  }
}
