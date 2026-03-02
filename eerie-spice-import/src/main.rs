mod codegen;
mod parser;
mod symbol;

use anyhow::{Context, Result};
use clap::Parser as ClapParser;
use codegen::{model_to_component, subckt_to_component};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(ClapParser, Debug)]
#[command(
    name = "eerie-spice-import",
    about = "Import SPICE .lib/.sub/.mod files → component YAML definitions"
)]
struct Args {
    /// Output directory for generated YAML files (e.g. components/)
    #[arg(short, long, default_value = "components")]
    output: PathBuf,

    /// SPICE library files to import
    #[arg(required = true)]
    files: Vec<PathBuf>,

    /// Only print what would be written, don't write files
    #[arg(long)]
    dry_run: bool,
}

fn main() -> Result<()> {
    env_logger::init();
    let args = Args::parse();

    let mut written = 0usize;
    let mut skipped = 0usize;
    let mut seen_ids: HashSet<String> = HashSet::new();

    for path in &args.files {
        let bytes = std::fs::read(path)
            .with_context(|| format!("reading {}", path.display()))?;
        let source = String::from_utf8_lossy(&bytes).into_owned();

        let parsed = parser::parse(&source)
            .with_context(|| format!("parsing {}", path.display()))?;

        println!(
            "[{}] {} models, {} subckts",
            path.display(),
            parsed.models.len(),
            parsed.subckts.len()
        );

        for m in &parsed.models {
            let Some(comp) = model_to_component(m) else {
                log::debug!("skipping unsupported model type: {} {:?}", m.name, m.model_type);
                skipped += 1;
                continue;
            };

            if !seen_ids.insert(comp.id.clone()) {
                log::warn!("duplicate id '{}', skipping", comp.id);
                skipped += 1;
                continue;
            }

            let out_path = output_path(&args.output, &comp.category, &comp.subcategory, &comp.id);
            write_yaml(&comp, &out_path, args.dry_run)?;
            written += 1;
        }

        for s in &parsed.subckts {
            let comp = subckt_to_component(s);

            if !seen_ids.insert(comp.id.clone()) {
                log::warn!("duplicate id '{}', skipping", comp.id);
                skipped += 1;
                continue;
            }

            let out_path = output_path(&args.output, &comp.category, &comp.subcategory, &comp.id);
            write_yaml(&comp, &out_path, args.dry_run)?;
            written += 1;
        }
    }

    println!("\nDone: {} written, {} skipped", written, skipped);
    Ok(())
}

fn output_path(base: &Path, category: &str, subcategory: &Option<String>, id: &str) -> PathBuf {
    let mut p = base.to_path_buf();
    p.push(category);
    if let Some(sub) = subcategory {
        for part in sub.split('/') {
            p.push(part);
        }
    }
    p.push(format!("{}.yaml", id));
    p
}

fn write_yaml<T: serde::Serialize>(val: &T, path: &Path, dry_run: bool) -> Result<()> {
    let yaml = serde_yaml::to_string(val)?;
    if dry_run {
        println!("--- {} ---\n{}", path.display(), yaml);
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating dir {}", parent.display()))?;
    }
    std::fs::write(path, yaml.as_bytes())
        .with_context(|| format!("writing {}", path.display()))?;
    println!("  wrote {}", path.display());
    Ok(())
}
