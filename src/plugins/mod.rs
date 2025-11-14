pub mod crates_io_plugin;
pub mod homebrew_plugin;
pub mod npm_plugin;
pub mod plugin_loader;
pub mod pypi_plugin;

pub use crates_io_plugin::CratesIoPlugin;
pub use homebrew_plugin::HomebrewPlugin;
pub use npm_plugin::NpmPlugin;
pub use plugin_loader::{DetectedPlugin, PluginLoader, RegistryType};
pub use pypi_plugin::PyPiPlugin;
