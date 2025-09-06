use std::{
    io::{self, Write},
    process::Stdio,
};

use anyhow::Result;
use camino::Utf8PathBuf;
use colored::Colorize;
use futures_util::{SinkExt, StreamExt};
use tapestry_host::{
    Request, RequestPayload, Response, ResponsePayload, codec::NativeMessagingCodec,
};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio_util::codec::{FramedRead, FramedWrite};
use uuid::Uuid;

struct ClientState {
    path: Option<Utf8PathBuf>,
    model: Option<String>,
    pattern: Option<String>,
    custom_prompt: Option<String>,
    content: String,
    host_process: Child,
    writer: FramedWrite<ChildStdin, NativeMessagingCodec<Request>>,
    reader: FramedRead<ChildStdout, NativeMessagingCodec<Response>>,
}

impl ClientState {
    fn new() -> Result<Self> {
        println!("{}", "Starting host process...".blue());

        let mut child = Command::new("cargo")
            .arg("run")
            .arg("--bin")
            .arg("tapestry-host")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();

        let writer = FramedWrite::new(stdin, NativeMessagingCodec::<Request>::default());
        let reader = FramedRead::new(stdout, NativeMessagingCodec::<Response>::default());

        println!("{}", "Host process started successfully".green());

        Ok(Self {
            path: None,
            model: None,
            pattern: None,
            custom_prompt: None,
            content: String::new(),
            host_process: child,
            writer,
            reader,
        })
    }

    fn display(&self) {
        println!("\n{}", "Current Request Configuration:".cyan().bold());
        println!(
            "  {}: {}",
            "Path".yellow(),
            self.path
                .as_ref()
                .map_or("(auto-detect fabric-ai)", |p| p.as_str())
        );
        println!(
            "  {}: {}",
            "Model".yellow(),
            self.model.as_ref().unwrap_or(&"(none)".to_string())
        );
        println!(
            "  {}: {}",
            "Pattern".yellow(),
            self.pattern.as_ref().unwrap_or(&"(none)".to_string())
        );
        println!(
            "  {}: {}",
            "Content".yellow(),
            if self.content.is_empty() {
                "(empty)".dimmed().to_string()
            } else {
                format!(
                    "\"{}...\"",
                    self.content.chars().take(50).collect::<String>()
                )
            }
        );
    }

    fn show_menu() {
        println!("\n{}", "Options:".green().bold());
        println!("  {} - Set path to fabric-ai executable", "1".bright_blue());
        println!("  {} - Set model", "2".bright_blue());
        println!("  {} - Set pattern", "3".bright_blue());
        println!("  {} - Set content", "4".bright_blue());
        println!(
            "  {} - Send request and stream responses",
            "s".bright_green()
        );
        println!("  {} - List available patterns", "l".bright_blue());
        println!("  {} - Send ping to test connection", "p".bright_blue());
        println!("  {} - Clear request", "c".bright_yellow());
        println!("  {} - Quit", "q".bright_red());
        print!("\n{} ", "Choose an option:".bold());
        io::stdout().flush().unwrap();
    }

    fn get_input(prompt: &str) -> Result<String> {
        print!("{} ", prompt.bright_white());
        io::stdout().flush()?;

        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        Ok(input.trim().to_string())
    }

    fn set_path(&mut self) -> Result<()> {
        let path_str = Self::get_input(
            "Enter path to fabric-ai executable (or press Enter for auto-detect):",
        )?;
        if path_str.is_empty() {
            self.path = None;
            println!("{}", "Path cleared - will auto-detect fabric-ai".green());
        } else {
            self.path = Some(Utf8PathBuf::from(path_str));
            println!("{}", "Path updated".green());
        }
        Ok(())
    }

    fn set_model(&mut self) -> Result<()> {
        let model = Self::get_input("Enter model name (or press Enter to clear):")?;
        if model.is_empty() {
            self.model = None;
            println!("{}", "Model cleared".green());
        } else {
            self.model = Some(model);
            println!("{}", "Model updated".green());
        }
        Ok(())
    }

    fn set_pattern(&mut self) -> Result<()> {
        let pattern = Self::get_input("Enter pattern name (or press Enter to clear):")?;
        if pattern.is_empty() {
            self.pattern = None;
            println!("{}", "Pattern cleared".green());
        } else {
            self.pattern = Some(pattern);
            println!("{}", "Pattern updated".green());
        }
        Ok(())
    }

    fn set_content(&mut self) {
        println!(
            "{}",
            "Enter content (press Ctrl+D on a new line when finished):".bright_white()
        );

        let mut content = String::new();
        let stdin = io::stdin();
        for line in stdin.lines() {
            match line {
                Ok(line) => {
                    use std::fmt::Write;
                    let _ = writeln!(content, "{line}");
                }
                Err(_) => break,
            }
        }

        self.content = content.trim_end().to_string();
        println!("{}", "Content updated".green());
    }

    async fn send_request(&mut self) -> Result<()> {
        if self.content.is_empty() {
            println!("{}", "Error: Content cannot be empty".red());
            return Ok(());
        }

        println!("\n{}", "Sending request...".blue().bold());

        let request = Request {
            id: Uuid::new_v4(),
            path: self.path.clone(),
            payload: RequestPayload::ProcessContent {
                content: self.content.clone(),
                model: self.model.clone(),
                pattern: self.pattern.clone(),
                context: None,
                custom_prompt: self.custom_prompt.clone(),
            },
        };

        self.writer.send(request).await?;

        println!("{}", "Streaming responses:".green().bold());
        println!("{}", "─".repeat(50).dimmed());

        while let Some(response) = self.reader.next().await {
            match response {
                Ok(Response {
                    payload: ResponsePayload::Content { content },
                    ..
                }) => {
                    println!("{content}");
                }
                Ok(Response {
                    payload: ResponsePayload::Done { exit_code },
                    ..
                }) => {
                    match exit_code {
                        Some(0) | None => {
                            println!("{}", "✓ Completed successfully".green());
                        }
                        Some(code) => {
                            println!("{} Exit code: {}", "✗ Process failed".red(), code);
                        }
                    }
                    break;
                }
                Ok(Response {
                    payload: ResponsePayload::Error { message },
                    ..
                }) => {
                    println!("{} {}", "✗ Error:".red(), message);
                    break;
                }
                Ok(Response {
                    payload:
                        ResponsePayload::PatternsList { .. }
                        | ResponsePayload::Pong { .. }
                        | ResponsePayload::ContextsList { .. },
                    ..
                }) => {}
                Err(e) => {
                    println!("{} {}", "Error reading response:".red(), e);
                    break;
                }
            }
        }

        println!("{}", "─".repeat(50).dimmed());
        Ok(())
    }

    fn clear(&mut self) {
        self.path = None;
        self.model = None;
        self.pattern = None;
        self.custom_prompt = None;
        self.content = String::new();
        println!("{}", "Request cleared".green());
    }

    async fn list_patterns(&mut self) -> Result<()> {
        println!("\n{}", "Fetching patterns...".blue().bold());

        let request = Request {
            id: Uuid::new_v4(),
            path: self.path.clone(),
            payload: RequestPayload::ListPatterns,
        };

        self.writer.send(request).await?;

        if let Some(response) = self.reader.next().await {
            match response {
                Ok(Response {
                    payload: ResponsePayload::PatternsList { patterns },
                    ..
                }) => {
                    if patterns.is_empty() {
                        println!("{}", "No patterns available".yellow());
                    } else {
                        println!("\n{}", "Available Patterns:".green().bold());
                        println!("{}", "─".repeat(30).dimmed());
                        for pattern in patterns {
                            println!("  • {}", pattern.bright_white());
                        }
                        println!("{}", "─".repeat(30).dimmed());
                    }
                }
                Ok(Response {
                    payload: ResponsePayload::Error { message },
                    ..
                }) => {
                    println!("{} {}", "✗ Error:".red(), message);
                }
                Ok(_) => {
                    println!("{}", "Unexpected response type".yellow());
                }
                Err(e) => {
                    println!("{} {}", "Error reading response:".red(), e);
                }
            }
        }

        Ok(())
    }

    async fn ping(&mut self) -> Result<()> {
        println!("\n{}", "Sending ping...".blue().bold());

        let request = Request {
            id: Uuid::new_v4(),
            path: None,
            payload: RequestPayload::Ping,
        };

        self.writer.send(request).await?;

        if let Some(response) = self.reader.next().await {
            match response {
                Ok(Response {
                    payload:
                        ResponsePayload::Pong {
                            resolved_path,
                            version,
                            valid,
                        },
                    ..
                }) => {
                    if valid {
                        println!("{}", "✓ Pong received - connection is working!".green());
                        if let Some(path) = resolved_path {
                            println!("  Path: {}", path.dimmed());
                        }
                        if let Some(ver) = version {
                            println!("  Version: {}", ver.dimmed());
                        }
                    } else {
                        println!("{}", "✗ Pong received but Fabric validation failed".red());
                        if let Some(path) = resolved_path {
                            println!("  Attempted path: {}", path.dimmed());
                        }
                    }
                }
                Ok(Response {
                    payload: ResponsePayload::Error { message },
                    ..
                }) => {
                    println!("{} {}", "✗ Error:".red(), message);
                }
                Ok(_) => {
                    println!("{}", "Unexpected response type".yellow());
                }
                Err(e) => {
                    println!("{} {}", "Error reading response:".red(), e);
                }
            }
        }

        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        println!("{}", "Shutting down host process...".yellow());

        self.writer.close().await?;

        let _ = self.host_process.kill().await;

        println!("{}", "Host process terminated".green());
        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("{}", "Tapestry Interactive Client".bright_magenta().bold());
    println!("{}", "=".repeat(30).dimmed());

    let mut state = ClientState::new()?;

    loop {
        state.display();
        ClientState::show_menu();

        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        let choice = input.trim().to_lowercase();

        match choice.as_str() {
            "1" => state.set_path()?,
            "2" => state.set_model()?,
            "3" => state.set_pattern()?,
            "4" => state.set_content(),
            "s" => state.send_request().await?,
            "l" => state.list_patterns().await?,
            "p" => state.ping().await?,
            "c" => state.clear(),
            "q" => {
                state.shutdown().await?;
                println!("{}", "Goodbye!".bright_green());
                break;
            }
            _ => println!("{}", "Invalid option. Please try again.".red()),
        }
    }

    Ok(())
}
