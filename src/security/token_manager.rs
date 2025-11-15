//! Secure token manager with memory-safe handling and masking capabilities
//!
//! This module provides secure token management for package registry authentication,
//! using the `secrecy` crate to prevent accidental token exposure in logs or memory dumps.

use regex::Regex;
use secrecy::{ExposeSecret, SecretString};
use std::collections::HashMap;
use std::env;

/// Supported package registries with their environment variable names
const REGISTRY_TOKENS: &[(&str, &str)] = &[
    ("npm", "NPM_TOKEN"),
    ("crates.io", "CARGO_REGISTRY_TOKEN"),
    ("pypi", "PYPI_TOKEN"),
    ("homebrew", "HOMEBREW_GITHUB_API_TOKEN"),
];

/// Secure token manager for package registry authentication
///
/// # Examples
///
/// ```
/// use package_publisher::security::SecureTokenManager;
/// use secrecy::ExposeSecret;
///
/// let manager = SecureTokenManager::new();
/// if let Some(token) = manager.get_token("npm") {
///     println!("NPM token found: {}", manager.mask_token(token.expose_secret()));
/// }
/// ```
#[derive(Default)]
pub struct SecureTokenManager {
    registry_map: HashMap<String, String>,
}

impl SecureTokenManager {
    /// Creates a new SecureTokenManager with default registry mappings
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecureTokenManager;
    ///
    /// let manager = SecureTokenManager::new();
    /// assert_eq!(manager.get_supported_registries().len(), 4);
    /// ```
    pub fn new() -> Self {
        let registry_map = REGISTRY_TOKENS
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        Self { registry_map }
    }

    /// Retrieves a token for the specified registry from environment variables
    ///
    /// Returns `None` if the registry is not supported or the token is not set.
    ///
    /// # Arguments
    ///
    /// * `registry_name` - Name of the registry (e.g., "npm", "crates.io")
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecureTokenManager;
    ///
    /// let manager = SecureTokenManager::new();
    /// match manager.get_token("npm") {
    ///     Some(token) => println!("Token retrieved"),
    ///     None => println!("No token found"),
    /// }
    /// ```
    pub fn get_token(&self, registry_name: &str) -> Option<SecretString> {
        let token_name = self.registry_map.get(registry_name)?;
        let token_value = env::var(token_name).ok()?;
        Some(SecretString::new(token_value.into()))
    }

    /// Checks if a token is set for the specified registry
    ///
    /// # Arguments
    ///
    /// * `registry_name` - Name of the registry to check
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecureTokenManager;
    ///
    /// let manager = SecureTokenManager::new();
    /// if manager.has_token("npm") {
    ///     println!("NPM token is configured");
    /// }
    /// ```
    pub fn has_token(&self, registry_name: &str) -> bool {
        self.get_token(registry_name).is_some()
    }

    /// Masks a token for safe logging
    ///
    /// Shows only the first 3 and last 3 characters for identification purposes.
    /// Tokens shorter than 10 characters are fully masked as "****".
    ///
    /// # Arguments
    ///
    /// * `token` - The token string to mask
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecureTokenManager;
    ///
    /// let manager = SecureTokenManager::new();
    /// assert_eq!(manager.mask_token("abcdef123456"), "abc...456");
    /// assert_eq!(manager.mask_token("short"), "****");
    /// ```
    pub fn mask_token(&self, token: &str) -> String {
        if token.is_empty() || token.len() < 10 {
            return "****".to_string();
        }

        let prefix = &token[..3];
        let suffix = &token[token.len() - 3..];
        format!("{}...{}", prefix, suffix)
    }

    /// Masks all known tokens in a string
    ///
    /// Scans the input string for any configured registry tokens and replaces them
    /// with masked versions for safe logging.
    ///
    /// # Arguments
    ///
    /// * `text` - The string to sanitize
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecureTokenManager;
    ///
    /// let manager = SecureTokenManager::new();
    /// let sanitized = manager.mask_tokens_in_string("Token: my-secret-token");
    /// // Tokens are masked if they match known registry tokens
    /// ```
    pub fn mask_tokens_in_string(&self, text: &str) -> String {
        let mut masked = text.to_string();

        // Mask all known tokens
        for registry_name in self.registry_map.keys() {
            if let Some(token) = self.get_token(registry_name) {
                let token_str = token.expose_secret();
                let escaped = Self::escape_regex(token_str);
                if let Ok(regex) = Regex::new(&escaped) {
                    let masked_token = self.mask_token(token_str);
                    masked = regex
                        .replace_all(&masked, masked_token.as_str())
                        .to_string();
                }
            }
        }

        masked
    }

    /// Gets the environment variable name for a registry
    ///
    /// # Arguments
    ///
    /// * `registry_name` - Name of the registry
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecureTokenManager;
    ///
    /// let manager = SecureTokenManager::new();
    /// assert_eq!(manager.get_token_name("npm"), Some("NPM_TOKEN"));
    /// assert_eq!(manager.get_token_name("unknown"), None);
    /// ```
    pub fn get_token_name(&self, registry_name: &str) -> Option<&str> {
        self.registry_map.get(registry_name).map(|s| s.as_str())
    }

    /// Returns a list of all supported registry names
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecureTokenManager;
    ///
    /// let manager = SecureTokenManager::new();
    /// let registries = manager.get_supported_registries();
    /// assert!(registries.contains(&"npm".to_string()));
    /// ```
    pub fn get_supported_registries(&self) -> Vec<String> {
        self.registry_map.keys().cloned().collect()
    }

    /// Escapes special regex characters in a string
    ///
    /// # Arguments
    ///
    /// * `text` - The string to escape
    fn escape_regex(text: &str) -> String {
        regex::escape(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_manager() {
        let manager = SecureTokenManager::new();
        assert_eq!(manager.get_supported_registries().len(), 4);
    }

    #[test]
    fn test_get_token_returns_none_for_unknown_registry() {
        let manager = SecureTokenManager::new();
        assert!(manager.get_token("unknown-registry").is_none());
    }

    #[test]
    fn test_get_token_returns_secret_when_env_var_set() {
        unsafe {
            env::set_var("NPM_TOKEN", "test-npm-token-12345");
        }
        let manager = SecureTokenManager::new();
        let token = manager.get_token("npm");
        assert!(token.is_some());
        assert_eq!(token.unwrap().expose_secret(), "test-npm-token-12345");
        unsafe {
            env::remove_var("NPM_TOKEN");
        }
    }

    #[test]
    fn test_has_token_returns_false_when_not_set() {
        unsafe {
            env::remove_var("CARGO_REGISTRY_TOKEN");
        }
        let manager = SecureTokenManager::new();
        assert!(!manager.has_token("crates.io"));
    }

    #[test]
    fn test_has_token_returns_true_when_set() {
        unsafe {
            env::set_var("PYPI_TOKEN", "test-pypi-token");
        }
        let manager = SecureTokenManager::new();
        assert!(manager.has_token("pypi"));
        unsafe {
            env::remove_var("PYPI_TOKEN");
        }
    }

    #[test]
    fn test_mask_token_with_short_token() {
        let manager = SecureTokenManager::new();
        assert_eq!(manager.mask_token("short"), "****");
        assert_eq!(manager.mask_token(""), "****");
    }

    #[test]
    fn test_mask_token_with_long_token() {
        let manager = SecureTokenManager::new();
        assert_eq!(manager.mask_token("abcdef123456"), "abc...456");
        assert_eq!(manager.mask_token("very-long-token-string"), "ver...ing");
    }

    #[test]
    fn test_mask_tokens_in_string_no_tokens() {
        let manager = SecureTokenManager::new();
        let input = "This is a safe string with no tokens";
        assert_eq!(manager.mask_tokens_in_string(input), input);
    }

    #[test]
    fn test_mask_tokens_in_string_with_token() {
        unsafe {
            env::set_var("NPM_TOKEN", "secret-npm-token-12345");
        }
        let manager = SecureTokenManager::new();
        let input = "Publishing with token: secret-npm-token-12345";
        let output = manager.mask_tokens_in_string(input);
        assert!(output.contains("sec...345"));
        assert!(!output.contains("secret-npm-token-12345"));
        unsafe {
            env::remove_var("NPM_TOKEN");
        }
    }

    #[test]
    fn test_get_token_name_for_known_registry() {
        let manager = SecureTokenManager::new();
        assert_eq!(manager.get_token_name("npm"), Some("NPM_TOKEN"));
        assert_eq!(
            manager.get_token_name("crates.io"),
            Some("CARGO_REGISTRY_TOKEN")
        );
    }

    #[test]
    fn test_get_token_name_for_unknown_registry() {
        let manager = SecureTokenManager::new();
        assert_eq!(manager.get_token_name("unknown"), None);
    }

    #[test]
    fn test_get_supported_registries() {
        let manager = SecureTokenManager::new();
        let registries = manager.get_supported_registries();
        assert_eq!(registries.len(), 4);
        assert!(registries.contains(&"npm".to_string()));
        assert!(registries.contains(&"crates.io".to_string()));
        assert!(registries.contains(&"pypi".to_string()));
        assert!(registries.contains(&"homebrew".to_string()));
    }

    #[test]
    fn test_escape_regex_special_chars() {
        let escaped = SecureTokenManager::escape_regex("test.token+with*special$chars");
        assert_eq!(escaped, "test\\.token\\+with\\*special\\$chars");
    }
}
