/**
 * Secure token manager with masking capabilities
 */

const TOKEN_NAMES: Record<string, string> = {
  npm: 'NPM_TOKEN',
  'crates.io': 'CARGO_REGISTRY_TOKEN',
  pypi: 'PYPI_TOKEN',
  homebrew: 'HOMEBREW_GITHUB_API_TOKEN'
}

export class SecureTokenManager {
  /**
   * Get token for a registry from environment variables
   */
  getToken(registryName: string): string | undefined {
    const tokenName = TOKEN_NAMES[registryName]
    if (!tokenName) {
      return undefined
    }

    return process.env[tokenName]
  }

  /**
   * Check if token is set for a registry
   */
  hasToken(registryName: string): boolean {
    return !!this.getToken(registryName)
  }

  /**
   * Mask a token for safe logging
   * Example: "abcdef123456" -> "abc...456"
   */
  maskToken(token: string): string {
    if (!token || token.length < 10) {
      return '****'
    }

    const prefix = token.slice(0, 3)
    const suffix = token.slice(-3)
    return `${prefix}...${suffix}`
  }

  /**
   * Mask all tokens in a string
   */
  maskTokensInString(str: string): string {
    let masked = str

    // Mask all known tokens
    for (const registryName of Object.keys(TOKEN_NAMES)) {
      const token = this.getToken(registryName)
      if (token) {
        const regex = new RegExp(this.escapeRegExp(token), 'g')
        masked = masked.replace(regex, this.maskToken(token))
      }
    }

    return masked
  }

  /**
   * Get token name for a registry
   */
  getTokenName(registryName: string): string | undefined {
    return TOKEN_NAMES[registryName]
  }

  /**
   * Get all supported registries
   */
  getSupportedRegistries(): string[] {
    return Object.keys(TOKEN_NAMES)
  }

  /**
   * Escape special regex characters
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Set token for a registry (for testing purposes only)
   * WARNING: Do not use in production code
   */
  setTokenForTesting(registryName: string, token: string): void {
    const tokenName = TOKEN_NAMES[registryName]
    if (tokenName) {
      process.env[tokenName] = token
    }
  }

  /**
   * Clear token for a registry (for testing purposes only)
   */
  clearTokenForTesting(registryName: string): void {
    const tokenName = TOKEN_NAMES[registryName]
    if (tokenName) {
      delete process.env[tokenName]
    }
  }
}
