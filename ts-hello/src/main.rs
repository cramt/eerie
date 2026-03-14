#[tokio::main]
async fn main() {
    deno_bundle::bundle!("src/hello.ts").run().await;
}
