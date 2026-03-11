use std::collections::HashSet;

use facet::Facet;

use crate::component::ComponentData;

#[derive(Facet, Debug, Clone)]
pub struct Circuit {
    name: String,
    components: Vec<ComponentData>,
    network_map: Vec<HashSet<String>>,
    pub pins: HashSet<String>,
}
