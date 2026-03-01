use facet::Facet;
use serde::{Deserialize, Serialize};

use crate::component::ComponentInstance;
use crate::net::Net;

/// Top-level circuit document. Serializes to a `.eerie` YAML file.
///
/// IDs are strings — they can be anything unique within the file.
/// The UI uses UUID v4 strings; manually authored files may use
/// human-readable names like "R1", "GND_net", etc.
/// If `id` is omitted in YAML it is auto-generated on load.
#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct Circuit {
    #[serde(default = "new_id")]
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub version: String,
    #[serde(default)]
    pub components: Vec<ComponentInstance>,
    #[serde(default)]
    pub nets: Vec<Net>,
    pub metadata: CircuitMetadata,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct CircuitMetadata {
    pub created_at: String,
    pub modified_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
}

impl Circuit {
    pub fn new(name: impl Into<String>) -> Self {
        let now = iso_now();
        Self {
            id: new_id(),
            name: name.into(),
            description: None,
            version: "0.1".into(),
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

/// ISO-8601 timestamp. In WASM context there's no system clock;
/// the daemon sets this properly when saving files.
pub fn iso_now() -> String {
    "1970-01-01T00:00:00Z".into()
}
