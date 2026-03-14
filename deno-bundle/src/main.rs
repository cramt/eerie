use std::{env, path::Path, process::{Command, exit}};

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();

    if args.len() < 2 {
        eprintln!("Usage: deno-bundle <entry> <output>");
        exit(1);
    }

    let status = Command::new("deno")
        .arg("bundle")
        .arg(Path::new(&args[0]))
        .arg(Path::new(&args[1]))
        .status()
        .unwrap_or_else(|e| {
            eprintln!("Failed to run deno: {e}");
            exit(1);
        });

    exit(status.code().unwrap_or(1));
}
