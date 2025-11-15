//! State machine for tracking publishing workflow with resume capability
//!
//! This module provides state management with atomic file operations.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;

/// State file name
const STATE_FILE: &str = ".publish-state.json";

/// Publishing state
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PublishState {
    Initial,
    Detecting,
    Validating,
    DryRun,
    Confirming,
    Publishing,
    Verifying,
    Success,
    Failed,
    RolledBack,
}

/// State transition
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StateTransition {
    /// From state
    pub from: PublishState,

    /// To state
    pub to: PublishState,

    /// Timestamp
    pub timestamp: DateTime<Utc>,

    /// Additional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

/// Publish state data
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PublishStateData {
    /// Current state
    #[serde(rename = "currentState")]
    pub current_state: PublishState,

    /// Registry name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registry: Option<String>,

    /// Package version
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,

    /// State transition history
    pub transitions: Vec<StateTransition>,

    /// Can this state be resumed?
    #[serde(rename = "canResume")]
    pub can_resume: bool,

    /// Last error message (if failed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// State machine for tracking publishing workflow
pub struct PublishStateMachine {
    current_state: PublishState,
    transitions: Vec<StateTransition>,
    state_file_path: PathBuf,
    registry: Option<String>,
    version: Option<String>,
    error: Option<String>,
}

impl PublishStateMachine {
    /// Create a new state machine
    pub fn new<P: AsRef<Path>>(project_path: P) -> Self {
        let state_file_path = project_path.as_ref().join(STATE_FILE);

        Self {
            current_state: PublishState::Initial,
            transitions: Vec::new(),
            state_file_path,
            registry: None,
            version: None,
            error: None,
        }
    }

    /// Transition to a new state
    pub async fn transition(
        &mut self,
        to: PublishState,
        metadata: Option<HashMap<String, serde_json::Value>>,
    ) -> Result<(), std::io::Error> {
        let transition = StateTransition {
            from: self.current_state,
            to,
            timestamp: Utc::now(),
            metadata: metadata.clone(),
        };

        self.transitions.push(transition);
        self.current_state = to;

        // Update metadata if provided
        if let Some(meta) = metadata {
            if let Some(serde_json::Value::String(registry)) = meta.get("registry") {
                self.registry = Some(registry.clone());
            }
            if let Some(serde_json::Value::String(version)) = meta.get("version") {
                self.version = Some(version.clone());
            }
            if let Some(serde_json::Value::String(error)) = meta.get("error") {
                self.error = Some(error.clone());
            }
        }

        // Persist state
        self.save().await?;

        Ok(())
    }

    /// Get current state
    pub fn get_state(&self) -> PublishState {
        self.current_state
    }

    /// Get state data
    pub fn get_state_data(&self) -> PublishStateData {
        PublishStateData {
            current_state: self.current_state,
            registry: self.registry.clone(),
            version: self.version.clone(),
            transitions: self.transitions.clone(),
            can_resume: self.can_resume(),
            error: self.error.clone(),
        }
    }

    /// Check if state can be resumed
    pub fn can_resume(&self) -> bool {
        // Can resume if not in terminal states
        !matches!(
            self.current_state,
            PublishState::Success | PublishState::Failed | PublishState::Initial
        )
    }

    /// Restore state from file
    pub async fn restore(&mut self) -> Result<bool, std::io::Error> {
        if !self.state_file_path.exists() {
            return Ok(false);
        }

        let content = fs::read_to_string(&self.state_file_path).await?;
        let data: PublishStateData = serde_json::from_str(&content)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        self.current_state = data.current_state;
        self.registry = data.registry;
        self.version = data.version;
        self.error = data.error;
        self.transitions = data.transitions;

        Ok(true)
    }

    /// Save state to file (atomic operation)
    async fn save(&self) -> Result<(), std::io::Error> {
        let data = self.get_state_data();

        let json = serde_json::to_string_pretty(&data)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        // Atomic write: write to temp file, then rename
        let temp_file = self.state_file_path.with_extension("json.tmp");
        fs::write(&temp_file, json).await?;
        fs::rename(&temp_file, &self.state_file_path).await?;

        Ok(())
    }

    /// Clear state file
    pub async fn clear(&mut self) -> Result<(), std::io::Error> {
        // Remove state file if it exists
        if self.state_file_path.exists() {
            fs::remove_file(&self.state_file_path).await?;
        }

        // Reset internal state
        self.current_state = PublishState::Initial;
        self.transitions.clear();
        self.registry = None;
        self.version = None;
        self.error = None;

        Ok(())
    }

    /// Get last error
    pub fn get_last_error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    /// Get elapsed time since start
    pub fn get_elapsed_time(&self) -> i64 {
        if self.transitions.is_empty() {
            return 0;
        }

        let first_transition = &self.transitions[0];
        let last_transition = &self.transitions[self.transitions.len() - 1];

        (last_transition.timestamp - first_transition.timestamp).num_milliseconds()
    }

    /// Get transition history as human-readable string
    pub fn get_history(&self) -> String {
        self.transitions
            .iter()
            .map(|t| {
                let time = t.timestamp.to_rfc3339();
                let meta = if let Some(metadata) = &t.metadata {
                    format!(" ({})", serde_json::to_string(metadata).unwrap_or_default())
                } else {
                    String::new()
                };
                format!("{}: {:?} → {:?}{}", time, t.from, t.to, meta)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_new_state_machine() {
        let temp_dir = TempDir::new().unwrap();
        let state_machine = PublishStateMachine::new(temp_dir.path());

        assert_eq!(state_machine.get_state(), PublishState::Initial);
        assert!(!state_machine.can_resume());
    }

    #[tokio::test]
    async fn test_transition() {
        let temp_dir = TempDir::new().unwrap();
        let mut state_machine = PublishStateMachine::new(temp_dir.path());

        state_machine
            .transition(PublishState::Detecting, None)
            .await
            .unwrap();

        assert_eq!(state_machine.get_state(), PublishState::Detecting);
        assert!(state_machine.can_resume());
    }

    #[tokio::test]
    async fn test_transition_with_metadata() {
        let temp_dir = TempDir::new().unwrap();
        let mut state_machine = PublishStateMachine::new(temp_dir.path());

        let mut metadata = HashMap::new();
        metadata.insert(
            "registry".to_string(),
            serde_json::Value::String("npm".to_string()),
        );
        metadata.insert(
            "version".to_string(),
            serde_json::Value::String("1.0.0".to_string()),
        );

        state_machine
            .transition(PublishState::Publishing, Some(metadata))
            .await
            .unwrap();

        let state_data = state_machine.get_state_data();
        assert_eq!(state_data.registry, Some("npm".to_string()));
        assert_eq!(state_data.version, Some("1.0.0".to_string()));
    }

    #[tokio::test]
    async fn test_restore_state() {
        let temp_dir = TempDir::new().unwrap();
        let mut state_machine = PublishStateMachine::new(temp_dir.path());

        // Create a state
        let mut metadata = HashMap::new();
        metadata.insert(
            "registry".to_string(),
            serde_json::Value::String("npm".to_string()),
        );

        state_machine
            .transition(PublishState::Validating, Some(metadata))
            .await
            .unwrap();

        // Create a new state machine and restore
        let mut restored_state_machine = PublishStateMachine::new(temp_dir.path());
        let restored = restored_state_machine.restore().await.unwrap();

        assert!(restored);
        assert_eq!(restored_state_machine.get_state(), PublishState::Validating);
        assert_eq!(restored_state_machine.registry, Some("npm".to_string()));
    }

    #[tokio::test]
    async fn test_clear_state() {
        let temp_dir = TempDir::new().unwrap();
        let mut state_machine = PublishStateMachine::new(temp_dir.path());

        state_machine
            .transition(PublishState::Publishing, None)
            .await
            .unwrap();

        state_machine.clear().await.unwrap();

        assert_eq!(state_machine.get_state(), PublishState::Initial);
        assert_eq!(state_machine.transitions.len(), 0);
    }

    #[tokio::test]
    async fn test_can_resume() {
        let temp_dir = TempDir::new().unwrap();
        let mut state_machine = PublishStateMachine::new(temp_dir.path());

        // Terminal states cannot be resumed
        state_machine
            .transition(PublishState::Success, None)
            .await
            .unwrap();
        assert!(!state_machine.can_resume());

        state_machine
            .transition(PublishState::Failed, None)
            .await
            .unwrap();
        assert!(!state_machine.can_resume());

        // Non-terminal states can be resumed
        state_machine
            .transition(PublishState::Publishing, None)
            .await
            .unwrap();
        assert!(state_machine.can_resume());
    }

    #[tokio::test]
    async fn test_get_elapsed_time() {
        let temp_dir = TempDir::new().unwrap();
        let mut state_machine = PublishStateMachine::new(temp_dir.path());

        state_machine
            .transition(PublishState::Detecting, None)
            .await
            .unwrap();

        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        state_machine
            .transition(PublishState::Validating, None)
            .await
            .unwrap();

        let elapsed = state_machine.get_elapsed_time();
        assert!(elapsed >= 100);
    }

    #[tokio::test]
    async fn test_get_history() {
        let temp_dir = TempDir::new().unwrap();
        let mut state_machine = PublishStateMachine::new(temp_dir.path());

        state_machine
            .transition(PublishState::Detecting, None)
            .await
            .unwrap();
        state_machine
            .transition(PublishState::Validating, None)
            .await
            .unwrap();

        let history = state_machine.get_history();
        assert!(history.contains("Initial → Detecting"));
        assert!(history.contains("Detecting → Validating"));
    }
}
