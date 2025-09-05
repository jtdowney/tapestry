use std::{io::Read as _, process::Stdio};

use anyhow::{Context, Result};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::{ChildStdin, ChildStdout, Command},
};

#[tokio::main]
async fn main() -> Result<()> {
    let mut stdin_buf = String::new();
    std::io::stdin()
        .read_to_string(&mut stdin_buf)
        .context("failed to read stdin")?;

    let trimmed = stdin_buf.trim();
    if trimmed.is_empty() {
        eprintln!(
            "No input provided. Pipe a JSON request into stdin.\n\nExample:\n  echo '{{\"id\":\"<uuid>\",\"type\":\"ping\"}}' | cargo run --example simple_passthrough"
        );
        std::process::exit(2);
    }

    let json_value: serde_json::Value =
        serde_json::from_str(trimmed).context("stdin did not contain valid JSON")?;
    let json_compact = serde_json::to_string(&json_value)?;

    let mut child = Command::new("cargo")
        .arg("run")
        .arg("--bin")
        .arg("tapestry-host")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .context("failed to spawn tapestry-host via cargo")?;

    let mut child_stdin: ChildStdin = child
        .stdin
        .take()
        .context("failed to acquire child stdin")?;
    let mut child_stdout: ChildStdout = child
        .stdout
        .take()
        .context("failed to acquire child stdout")?;

    let payload = json_compact.as_bytes();
    #[allow(clippy::cast_possible_truncation)]
    let len_le = (payload.len() as u32).to_le_bytes();
    child_stdin
        .write_all(&len_le)
        .await
        .context("failed writing length prefix to host")?;
    child_stdin
        .write_all(payload)
        .await
        .context("failed writing JSON payload to host")?;
    child_stdin.flush().await.ok();

    drop(child_stdin);

    loop {
        let mut len_buf = [0u8; 4];
        match child_stdout.read_exact(&mut len_buf).await {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => return Err(e).context("error reading response length from host"),
        }

        let msg_len = u32::from_le_bytes(len_buf) as usize;
        if msg_len == 0 {
            eprintln!("warning: host emitted zero-length message");
            continue;
        }

        let mut msg_buf = vec![0u8; msg_len];
        child_stdout
            .read_exact(&mut msg_buf)
            .await
            .context("error reading response payload from host")?;

        match String::from_utf8(msg_buf) {
            Ok(s) => {
                println!("{s}");
            }
            Err(_) => {
                eprintln!("warning: response was not valid UTF-8 JSON");
            }
        }
    }

    let _ = child.wait().await;
    Ok(())
}
