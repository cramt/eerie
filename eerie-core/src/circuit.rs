use facet::Facet;

use crate::component::ComponentInstance;
use crate::net::Net;

/// Top-level circuit document. Serializes to a `.eerie` YAML file.
///
/// IDs are strings — anything unique within the file.
/// The UI uses UUID v4 strings; hand-authored files may use human-readable
/// names like "R1", "GND_net", etc.
/// Omit `id` in YAML and Eerie auto-generates one on load.
#[derive(Facet, Debug, Clone)]
pub struct Circuit {
    #[facet(default = new_id())]
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    #[facet(default = default_version())]
    pub version: String,
    #[facet(default)]
    pub components: Vec<ComponentInstance>,
    #[facet(default)]
    pub nets: Vec<Net>,
    pub metadata: CircuitMetadata,
}

#[derive(Facet, Debug, Clone)]
pub struct CircuitMetadata {
    pub created_at: String,
    pub modified_at: String,
    pub author: Option<String>,
}

impl Circuit {
    pub fn new(name: impl Into<String>) -> Self {
        let now = iso_now();
        Self {
            id: new_id(),
            name: name.into(),
            description: None,
            version: default_version(),
            components: Vec::new(),
            nets: Vec::new(),
            metadata: CircuitMetadata {
                created_at: now.clone(),
                modified_at: now,
                author: None,
            },
        }
    }

    pub fn touch(&mut self) {
        self.metadata.modified_at = iso_now();
    }

    pub fn component_by_id(&self, id: &str) -> Option<&ComponentInstance> {
        self.components.iter().find(|c| c.id == id)
    }

    pub fn component_by_id_mut(&mut self, id: &str) -> Option<&mut ComponentInstance> {
        self.components.iter_mut().find(|c| c.id == id)
    }
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn default_version() -> String {
    "0.1".into()
}

/// ISO-8601 timestamp placeholder. The daemon fills in the real time when
/// saving files; WASM has no system clock.
pub fn iso_now() -> String {
    "1970-01-01T00:00:00Z".into()
}
