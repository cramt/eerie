use claude_agent_sdk_deno::{query, QueryParams, QueryOptions};

#[tokio::main]
async fn main() {
    let prompt = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "Hello! What can you do?".into());

    let mut rx = query(QueryParams {
        prompt,
        options: QueryOptions {
            allowed_tools: Some(vec!["Read".into(), "Glob".into(), "Grep".into()]),
            ..Default::default()
        },
    })
    .await
    .expect("Failed to start query");

    while let Some(msg) = rx.recv().await {
        match msg {
            Ok(json) => println!("{json}"),
            Err(e) => {
                eprintln!("Error: {e}");
                break;
            }
        }
    }
}
