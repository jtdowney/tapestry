use std::{error, io, path::PathBuf, process::Stdio};

use async_trait::async_trait;
use camino::{Utf8Path, Utf8PathBuf};
use futures_util::SinkExt;
use thiserror::Error;
use tokio::{
    io::{AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout},
};
use tokio_util::codec::{Encoder, FramedWrite};
use uuid::Uuid;

use crate::{Request, RequestPayload, Response, ResponsePayload, fabric::FabricCommandBuilder};

#[derive(Debug, Error)]
pub enum HandlerError {
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
    #[error("Failed to find fabric-ai in PATH: {0}")]
    FabricNotFound(#[from] which::Error),
    #[error("Path is not UTF-8: {}", .0.display())]
    PathNotUtf8(PathBuf),
    #[error("Codec error: {0}")]
    Codec(#[from] crate::codec::CodecError),
}

#[async_trait]
pub trait CommandRunner: Send + Sync {
    async fn fabric_version(&self) -> Result<CommandOutput, HandlerError>;
    async fn list_patterns(&self) -> Result<CommandOutput, HandlerError>;
    async fn fabric_path(&self) -> Result<&Utf8Path, HandlerError>;
    async fn spawn_process(
        &self,
        builder: FabricCommandBuilder<'_>,
    ) -> Result<Box<dyn ProcessHandle>, HandlerError>;
}

#[derive(Clone)]
pub struct CommandOutput {
    pub status: bool,
    pub stdout: String,
    pub stderr: String,
}

#[async_trait]
pub trait ProcessHandle: Send {
    async fn write_stdin(&mut self, data: &[u8]) -> Result<(), HandlerError>;
    async fn close_stdin(&mut self) -> Result<(), HandlerError>;
    async fn read_stdout_line(&mut self) -> Result<Option<String>, HandlerError>;
    async fn wait(self: Box<Self>) -> Result<Option<i32>, HandlerError>;
}

pub struct FabricCommandRunner {
    fabric_path: Utf8PathBuf,
}

impl FabricCommandRunner {
    pub fn new<P: AsRef<Utf8Path>>(path: P) -> Self {
        Self {
            fabric_path: path.as_ref().to_owned(),
        }
    }
}

#[async_trait]
impl CommandRunner for FabricCommandRunner {
    async fn fabric_version(&self) -> Result<CommandOutput, HandlerError> {
        let output = FabricCommandBuilder::new(&self.fabric_path)
            .version()
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .build()
            .output()
            .await?;

        Ok(CommandOutput {
            status: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout)
                .trim_end()
                .to_string(),
            stderr: String::from_utf8_lossy(&output.stderr)
                .trim_end()
                .to_string(),
        })
    }

    async fn list_patterns(&self) -> Result<CommandOutput, HandlerError> {
        let output = FabricCommandBuilder::new(&self.fabric_path)
            .list_patterns()
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .build()
            .output()
            .await?;

        Ok(CommandOutput {
            status: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }

    async fn fabric_path(&self) -> Result<&Utf8Path, HandlerError> {
        Ok(&self.fabric_path)
    }

    async fn spawn_process(
        &self,
        builder: FabricCommandBuilder<'_>,
    ) -> Result<Box<dyn ProcessHandle>, HandlerError> {
        let mut child = builder.build().spawn()?;

        let stdin = child.stdin.take();
        let stdout = child.stdout.take();

        Ok(Box::new(RealProcessHandle {
            child,
            stdin,
            stdout_reader: stdout.map(BufReader::new),
        }))
    }
}

struct RealProcessHandle {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout_reader: Option<BufReader<ChildStdout>>,
}

#[async_trait]
impl ProcessHandle for RealProcessHandle {
    async fn write_stdin(&mut self, data: &[u8]) -> Result<(), HandlerError> {
        if let Some(ref mut stdin) = self.stdin {
            stdin.write_all(data).await?;
        }
        Ok(())
    }

    async fn close_stdin(&mut self) -> Result<(), HandlerError> {
        if let Some(mut stdin) = self.stdin.take() {
            stdin.shutdown().await?;
        }
        Ok(())
    }

    async fn read_stdout_line(&mut self) -> Result<Option<String>, HandlerError> {
        if let Some(ref mut reader) = self.stdout_reader {
            let mut buf = String::new();
            let n = reader.read_line(&mut buf).await?;
            if n == 0 { Ok(None) } else { Ok(Some(buf)) }
        } else {
            Ok(None)
        }
    }

    async fn wait(mut self: Box<Self>) -> Result<Option<i32>, HandlerError> {
        let status = self.child.wait().await?;
        Ok(status.code())
    }
}

pub async fn handle_request<T, E, R, F>(
    writer: &mut FramedWrite<T, E>,
    request: Request,
    runner_factory: F,
) -> Result<(), HandlerError>
where
    T: AsyncWrite + Unpin,
    E: Encoder<Response>,
    <E as Encoder<Response>>::Error: error::Error + Send + Sync + 'static,
    R: CommandRunner,
    F: for<'a> FnOnce(&'a Utf8Path) -> R,
    HandlerError: From<<E as Encoder<Response>>::Error>,
{
    let request_id = request.id;
    let resolved_path = match resolve_path(request.path) {
        Ok(path) => path,
        Err(e) => match request.payload {
            RequestPayload::Ping => {
                writer
                    .send(Response {
                        id: request_id,
                        payload: ResponsePayload::Pong {
                            resolved_path: None,
                            version: None,
                            valid: false,
                        },
                    })
                    .await?;
                eprintln!("Failed to resolve fabric path: {e}");
                return Ok(());
            }
            _ => return Err(e),
        },
    };

    let runner = runner_factory(resolved_path.as_ref());

    match request.payload {
        RequestPayload::Ping => handle_ping(writer, request_id, &runner).await,
        RequestPayload::ListPatterns => handle_list_patterns(writer, request_id, &runner).await,
        RequestPayload::ProcessContent {
            content,
            model,
            pattern,
            custom_prompt,
        } => {
            handle_process_content(
                writer,
                request_id,
                &runner,
                model,
                pattern,
                custom_prompt,
                content,
            )
            .await
        }
    }
}

#[doc(hidden)]
pub async fn handle_ping<T, E, R>(
    writer: &mut FramedWrite<T, E>,
    request_id: Uuid,
    runner: &R,
) -> Result<(), HandlerError>
where
    T: AsyncWrite + Unpin,
    E: Encoder<Response>,
    <E as Encoder<Response>>::Error: error::Error + Send + Sync + 'static,
    R: CommandRunner,
    HandlerError: From<<E as Encoder<Response>>::Error>,
{
    let fabric_path = runner.fabric_path().await?;
    match runner.fabric_version().await {
        Ok(output) if output.status => {
            writer
                .send(Response {
                    id: request_id,
                    payload: ResponsePayload::Pong {
                        resolved_path: Some(fabric_path.to_string()),
                        version: Some(output.stdout),
                        valid: true,
                    },
                })
                .await?;
        }
        Ok(output) => {
            writer
                .send(Response {
                    id: request_id,
                    payload: ResponsePayload::Pong {
                        resolved_path: Some(fabric_path.to_string()),
                        version: None,
                        valid: false,
                    },
                })
                .await?;
            eprintln!("Fabric validation failed: {}", output.stderr);
        }
        Err(e) => {
            writer
                .send(Response {
                    id: request_id,
                    payload: ResponsePayload::Pong {
                        resolved_path: Some(fabric_path.to_string()),
                        version: None,
                        valid: false,
                    },
                })
                .await?;
            eprintln!("Failed to run fabric-ai: {e}");
        }
    }

    Ok(())
}

#[doc(hidden)]
pub async fn handle_list_patterns<T, E, R>(
    writer: &mut FramedWrite<T, E>,
    request_id: Uuid,
    runner: &R,
) -> Result<(), HandlerError>
where
    T: AsyncWrite + Unpin,
    E: Encoder<Response>,
    <E as Encoder<Response>>::Error: error::Error + Send + Sync + 'static,
    R: CommandRunner,
    HandlerError: From<<E as Encoder<Response>>::Error>,
{
    let output = runner.list_patterns().await?;

    if !output.status {
        writer
            .send(Response {
                id: request_id,
                payload: ResponsePayload::Error {
                    message: format!("Failed to list patterns: {}", output.stderr),
                },
            })
            .await?;
        return Ok(());
    }

    let patterns: Vec<String> = output
        .stdout
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    writer
        .send(Response {
            id: request_id,
            payload: ResponsePayload::PatternsList { patterns },
        })
        .await?;

    Ok(())
}

async fn stream_process_responses<T, E>(
    writer: &mut FramedWrite<T, E>,
    request_id: Uuid,
    mut process: Box<dyn ProcessHandle>,
    content: String,
) -> Result<Option<i32>, HandlerError>
where
    T: AsyncWrite + Unpin,
    E: Encoder<Response>,
    <E as Encoder<Response>>::Error: error::Error + Send + Sync + 'static,
    HandlerError: From<<E as Encoder<Response>>::Error>,
{
    process.write_stdin(content.as_bytes()).await?;
    process.close_stdin().await?;

    while let Some(line) = process.read_stdout_line().await? {
        writer
            .send(Response {
                id: request_id,
                payload: ResponsePayload::Content { content: line },
            })
            .await?;
    }

    process.wait().await
}

#[doc(hidden)]
pub async fn handle_process_content<T, E, R>(
    writer: &mut FramedWrite<T, E>,
    request_id: Uuid,
    runner: &R,
    model: Option<String>,
    pattern: Option<String>,
    custom_prompt: Option<String>,
    content: String,
) -> Result<(), HandlerError>
where
    T: AsyncWrite + Unpin,
    E: Encoder<Response>,
    <E as Encoder<Response>>::Error: error::Error + Send + Sync + 'static,
    R: CommandRunner,
    HandlerError: From<<E as Encoder<Response>>::Error>,
{
    let fabric_path = runner.fabric_path().await?;
    let mut builder = FabricCommandBuilder::new(fabric_path)
        .stream()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());

    if let Some(model) = model {
        builder = builder.model(model);
    }

    if let Some(pattern) = pattern {
        builder = builder.pattern(pattern);
    } else if let Some(custom_prompt) = custom_prompt {
        builder = builder.custom_prompt(custom_prompt);
    }

    let process = runner.spawn_process(builder).await?;

    let exit_code = stream_process_responses(writer, request_id, process, content).await?;

    writer
        .send(Response {
            id: request_id,
            payload: ResponsePayload::Done { exit_code },
        })
        .await?;

    Ok(())
}

#[doc(hidden)]
pub fn resolve_path<P>(path: Option<P>) -> Result<Utf8PathBuf, HandlerError>
where
    P: AsRef<Utf8Path>,
{
    if let Some(path) = path {
        let path_buf = path.as_ref().to_owned();

        if cfg!(debug_assertions) {
            eprintln!("[resolve_path] Checking provided path: {path_buf}");
        }

        if path_buf.exists() {
            if cfg!(debug_assertions) {
                eprintln!("[resolve_path] Path exists: {path_buf}");
            }
            Ok(path_buf)
        } else {
            if cfg!(debug_assertions) {
                eprintln!("[resolve_path] Path does not exist, falling back to PATH search");
            }
            which::which("fabric-ai")
                .map_err(HandlerError::from)
                .and_then(|path| {
                    Utf8PathBuf::from_path_buf(path).map_err(HandlerError::PathNotUtf8)
                })
        }
    } else {
        if cfg!(debug_assertions) {
            eprintln!("[resolve_path] No path provided, searching PATH for fabric-ai");
        }
        which::which("fabric-ai")
            .map_err(HandlerError::from)
            .and_then(|path| Utf8PathBuf::from_path_buf(path).map_err(HandlerError::PathNotUtf8))
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io,
        pin::Pin,
        sync::{Arc, Mutex},
        task::{Context, Poll},
    };

    use assert_matches::assert_matches;
    use bytes::BytesMut;
    use camino_tempfile::tempdir;
    use camino_tempfile_ext::prelude::*;
    use tokio::{io::AsyncWrite, sync::Mutex as TokioMutex};
    use tokio_util::codec::Encoder;

    use super::*;

    struct MockCommandRunner {
        fabric_path: Utf8PathBuf,
        version_response: Option<CommandOutput>,
        patterns_response: Option<CommandOutput>,
        process_handles: Arc<TokioMutex<Vec<MockProcessHandle>>>,
    }

    impl Default for MockCommandRunner {
        fn default() -> Self {
            Self {
                fabric_path: Utf8PathBuf::from("/usr/bin/fabric"),
                version_response: None,
                patterns_response: None,
                process_handles: Arc::new(TokioMutex::new(Vec::new())),
            }
        }
    }

    impl MockCommandRunner {
        fn with_version_response(mut self, output: CommandOutput) -> Self {
            self.version_response = Some(output);
            self
        }

        fn with_patterns_response(mut self, output: CommandOutput) -> Self {
            self.patterns_response = Some(output);
            self
        }

        async fn with_process_handle(self, handle: MockProcessHandle) -> Self {
            self.process_handles.lock().await.push(handle);
            self
        }
    }

    #[async_trait]
    impl CommandRunner for MockCommandRunner {
        async fn fabric_version(&self) -> Result<CommandOutput, HandlerError> {
            use std::io;
            self.version_response
                .clone()
                .ok_or_else(|| HandlerError::Io(io::Error::other("No mock response")))
        }

        async fn list_patterns(&self) -> Result<CommandOutput, HandlerError> {
            use std::io;
            self.patterns_response
                .clone()
                .ok_or_else(|| HandlerError::Io(io::Error::other("No mock response")))
        }

        async fn fabric_path(&self) -> Result<&Utf8Path, HandlerError> {
            Ok(&self.fabric_path)
        }

        async fn spawn_process(
            &self,
            _builder: FabricCommandBuilder<'_>,
        ) -> Result<Box<dyn ProcessHandle>, HandlerError> {
            use std::io;
            let mut handles = self.process_handles.lock().await;
            if let Some(handle) = handles.pop() {
                Ok(Box::new(handle))
            } else {
                Err(HandlerError::Io(io::Error::other(
                    "No mock process handle available",
                )))
            }
        }
    }

    struct MockProcessHandle {
        stdin_data: Arc<TokioMutex<Vec<u8>>>,
        stdout_lines: Arc<TokioMutex<Vec<String>>>,
        exit_code: Option<i32>,
        stdin_error: Option<io::Error>,
        stdout_error: Option<io::Error>,
        wait_error: Option<io::Error>,
    }

    impl MockProcessHandle {
        fn new(stdout_lines: Vec<String>, exit_code: Option<i32>) -> Self {
            Self {
                stdin_data: Arc::new(TokioMutex::new(Vec::new())),
                stdout_lines: Arc::new(TokioMutex::new(stdout_lines)),
                exit_code,
                stdin_error: None,
                stdout_error: None,
                wait_error: None,
            }
        }
    }

    #[async_trait]
    impl ProcessHandle for MockProcessHandle {
        async fn write_stdin(&mut self, data: &[u8]) -> Result<(), HandlerError> {
            if let Some(error) = &self.stdin_error {
                return Err(HandlerError::Io(io::Error::new(
                    error.kind(),
                    "Mock stdin error",
                )));
            }
            self.stdin_data.lock().await.extend_from_slice(data);
            Ok(())
        }

        async fn close_stdin(&mut self) -> Result<(), HandlerError> {
            if let Some(error) = &self.stdin_error {
                return Err(HandlerError::Io(io::Error::new(
                    error.kind(),
                    "Mock stdin close error",
                )));
            }
            Ok(())
        }

        async fn read_stdout_line(&mut self) -> Result<Option<String>, HandlerError> {
            if let Some(error) = &self.stdout_error {
                return Err(HandlerError::Io(io::Error::new(
                    error.kind(),
                    "Mock stdout error",
                )));
            }
            let mut lines = self.stdout_lines.lock().await;
            if lines.is_empty() {
                Ok(None)
            } else {
                Ok(Some(lines.remove(0)))
            }
        }

        async fn wait(self: Box<Self>) -> Result<Option<i32>, HandlerError> {
            if let Some(error) = &self.wait_error {
                return Err(HandlerError::Io(io::Error::new(
                    error.kind(),
                    "Mock wait error",
                )));
            }
            Ok(self.exit_code)
        }
    }

    struct TestWriter {
        messages: Arc<Mutex<Vec<Response>>>,
    }

    impl TestWriter {
        fn new() -> Self {
            Self {
                messages: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    impl AsyncWrite for TestWriter {
        fn poll_write(
            self: Pin<&mut Self>,
            _cx: &mut Context<'_>,
            _buf: &[u8],
        ) -> Poll<Result<usize, io::Error>> {
            Poll::Ready(Ok(0))
        }

        fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Result<(), io::Error>> {
            Poll::Ready(Ok(()))
        }

        fn poll_shutdown(
            self: Pin<&mut Self>,
            _cx: &mut Context<'_>,
        ) -> Poll<Result<(), io::Error>> {
            Poll::Ready(Ok(()))
        }
    }

    struct TestEncoder {
        messages: Arc<Mutex<Vec<Response>>>,
    }

    impl TestEncoder {
        fn new(messages: Arc<Mutex<Vec<Response>>>) -> Self {
            Self { messages }
        }
    }

    impl Encoder<Response> for TestEncoder {
        type Error = io::Error;

        fn encode(&mut self, item: Response, _dst: &mut BytesMut) -> Result<(), Self::Error> {
            self.messages.lock().unwrap().push(item);
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_resolve_path_with_existing_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.child("fabric-ai");
        file_path.touch().unwrap();

        let utf8_path = file_path.as_path().to_owned();
        let result = resolve_path(Some(&utf8_path));

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), utf8_path);
    }

    #[tokio::test]
    async fn test_resolve_path_with_non_existing_file() {
        let path = Utf8PathBuf::from("/non/existing/path/fabric-ai");
        let result = resolve_path(Some(&path));

        assert!(result.is_err() || result.unwrap() != path);
    }

    #[tokio::test]
    async fn test_resolve_path_with_no_path() {
        let result = resolve_path::<Utf8PathBuf>(None);

        assert!(result.is_err() || result.unwrap().to_string().contains("fabric-ai"));
    }

    #[tokio::test]
    async fn test_handle_ping_success() {
        let dir = tempdir().unwrap();
        let file_path = dir.child("fabric-ai");
        file_path.touch().unwrap();

        let runner = MockCommandRunner::default().with_version_response(CommandOutput {
            status: true,
            stdout: "fabric-ai version 1.0.0".to_string(),
            stderr: String::new(),
        });

        let test_writer = TestWriter::new();
        let messages = test_writer.messages.clone();
        let encoder = TestEncoder::new(messages.clone());
        let mut writer = FramedWrite::new(test_writer, encoder);

        let request_id = Uuid::new_v4();
        let result = handle_ping(&mut writer, request_id, &runner).await;
        assert!(result.is_ok());

        let messages = messages.lock().unwrap();
        assert_eq!(messages.len(), 1);

        if let ResponsePayload::Pong { valid, version, .. } = &messages[0].payload {
            assert!(valid);
            assert_eq!(version.as_deref(), Some("fabric-ai version 1.0.0"));
        } else {
            panic!("Expected Pong response");
        }
    }

    #[tokio::test]
    async fn test_handle_ping_failure() {
        let dir = tempdir().unwrap();
        let file_path = dir.child("fabric-ai");
        file_path.touch().unwrap();

        let runner = MockCommandRunner::default().with_version_response(CommandOutput {
            status: false,
            stdout: String::new(),
            stderr: "command not found".to_string(),
        });

        let test_writer = TestWriter::new();
        let messages = test_writer.messages.clone();
        let encoder = TestEncoder::new(messages.clone());
        let mut writer = FramedWrite::new(test_writer, encoder);
        let request_id = Uuid::new_v4();

        let result = handle_ping(&mut writer, request_id, &runner).await;
        assert!(result.is_ok());

        let messages = messages.lock().unwrap();
        assert_eq!(messages.len(), 1);

        if let ResponsePayload::Pong { valid, version, .. } = &messages[0].payload {
            assert!(!valid);
            assert!(version.is_none());
        } else {
            panic!("Expected Pong response");
        }
    }

    #[tokio::test]
    async fn test_handle_list_patterns_success() {
        let dir = tempdir().unwrap();
        let file_path = dir.child("fabric-ai");
        file_path.touch().unwrap();

        let runner = MockCommandRunner::default().with_patterns_response(CommandOutput {
            status: true,
            stdout: "pattern1\npattern2\npattern3\n".to_string(),
            stderr: String::new(),
        });

        let test_writer = TestWriter::new();
        let messages = test_writer.messages.clone();
        let encoder = TestEncoder::new(messages.clone());
        let mut writer = FramedWrite::new(test_writer, encoder);
        let request_id = Uuid::new_v4();

        let result = handle_list_patterns(&mut writer, request_id, &runner).await;
        assert!(result.is_ok());

        let messages = messages.lock().unwrap();
        assert_eq!(messages.len(), 1);

        if let ResponsePayload::PatternsList { patterns } = &messages[0].payload {
            assert_eq!(patterns, &["pattern1", "pattern2", "pattern3"]);
        } else {
            panic!("Expected PatternsList response");
        }
    }

    #[tokio::test]
    async fn test_handle_list_patterns_failure() {
        let dir = tempdir().unwrap();
        let file_path = dir.child("fabric-ai");
        file_path.touch().unwrap();

        let runner = MockCommandRunner::default().with_patterns_response(CommandOutput {
            status: false,
            stdout: String::new(),
            stderr: "Failed to list patterns".to_string(),
        });

        let test_writer = TestWriter::new();
        let messages = test_writer.messages.clone();
        let encoder = TestEncoder::new(messages.clone());
        let mut writer = FramedWrite::new(test_writer, encoder);
        let request_id = Uuid::new_v4();

        let result = handle_list_patterns(&mut writer, request_id, &runner).await;
        assert!(result.is_ok());

        let messages = messages.lock().unwrap();
        assert_eq!(messages.len(), 1);

        if let ResponsePayload::Error { message } = &messages[0].payload {
            assert!(message.contains("Failed to list patterns"));
        } else {
            panic!("Expected Error response");
        }
    }

    #[tokio::test]
    async fn test_handle_process_content() {
        let dir = tempdir().unwrap();
        let file_path = dir.child("fabric-ai");
        file_path.touch().unwrap();

        let stdout_lines = vec![
            "Processing line 1\n".to_string(),
            "Processing line 2\n".to_string(),
            "Done\n".to_string(),
        ];

        let process_handle = MockProcessHandle::new(stdout_lines, Some(0));
        let runner = MockCommandRunner::default()
            .with_process_handle(process_handle)
            .await;

        let test_writer = TestWriter::new();
        let messages = test_writer.messages.clone();
        let encoder = TestEncoder::new(messages.clone());
        let mut writer = FramedWrite::new(test_writer, encoder);

        let request_id = Uuid::new_v4();
        let model = Some("gpt-4".to_string());
        let pattern = Some("summarize".to_string());
        let custom_prompt = None;
        let content = "Test content to process".to_string();

        let result = handle_process_content(
            &mut writer,
            request_id,
            &runner,
            model,
            pattern,
            custom_prompt,
            content,
        )
        .await;
        assert!(result.is_ok());

        let messages = messages.lock().unwrap();
        assert_eq!(messages.len(), 4);

        assert_matches!(&messages[0].payload, ResponsePayload::Content { content } if content == "Processing line 1\n");
        assert_matches!(&messages[1].payload, ResponsePayload::Content { content } if content == "Processing line 2\n"
        );
        assert_matches!(&messages[2].payload, ResponsePayload::Content { content } if content == "Done\n"
        );
        assert_matches!(
            &messages[3].payload,
            ResponsePayload::Done { exit_code: Some(0) }
        );
    }

    #[tokio::test]
    async fn test_handle_ping_no_path() {
        use tokio_util::codec::FramedWrite;

        let runner = MockCommandRunner::default().with_version_response(CommandOutput {
            status: false,
            stdout: String::new(),
            stderr: "Mock error".to_string(),
        });

        let test_writer = TestWriter::new();
        let messages = test_writer.messages.clone();
        let encoder = TestEncoder::new(messages.clone());
        let mut writer = FramedWrite::new(test_writer, encoder);
        let request_id = Uuid::new_v4();

        let result = handle_ping(&mut writer, request_id, &runner).await;
        assert!(result.is_ok());

        let messages = messages.lock().unwrap();
        assert_eq!(messages.len(), 1);

        if let ResponsePayload::Pong { valid, .. } = &messages[0].payload {
            assert!(!valid);
        } else {
            panic!("Expected Pong response");
        }
    }

    #[tokio::test]
    async fn test_handle_process_content_error() {
        let dir = tempdir().unwrap();
        let file_path = dir.child("fabric-ai");
        file_path.touch().unwrap();

        let runner = MockCommandRunner::default();

        let test_writer = TestWriter::new();
        let messages = test_writer.messages.clone();
        let encoder = TestEncoder::new(messages.clone());
        let mut writer = FramedWrite::new(test_writer, encoder);

        let request_id = Uuid::new_v4();
        let content = "Test content".to_string();

        let result = handle_process_content(
            &mut writer,
            request_id,
            &runner,
            None,
            None,
            Some("custom prompt".to_string()),
            content,
        )
        .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_process_handle_stdin_error() {
        let mut mock_process = MockProcessHandle::new(vec![], Some(0));
        mock_process.set_stdin_error(io::Error::new(io::ErrorKind::BrokenPipe, "Stdin closed"));

        let result = mock_process.write_stdin(b"test data").await;
        assert!(result.is_err());
        assert_matches!(result.unwrap_err(), HandlerError::Io(_));
    }

    #[tokio::test]
    async fn test_process_handle_stdout_read_error() {
        let mut mock_process = MockProcessHandle::new(vec![], Some(0));
        mock_process.set_stdout_error(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "Stdout closed",
        ));

        let result = mock_process.read_stdout_line().await;
        assert!(result.is_err());
        assert_matches!(result.unwrap_err(), HandlerError::Io(_));
    }

    #[tokio::test]
    async fn test_process_handle_close_stdin_error() {
        let mut mock_process = MockProcessHandle::new(vec![], Some(0));
        mock_process.set_stdin_error(io::Error::new(
            io::ErrorKind::BrokenPipe,
            "Cannot close stdin",
        ));

        let result = mock_process.close_stdin().await;
        assert!(result.is_err());
        assert_matches!(result.unwrap_err(), HandlerError::Io(_));
    }

    #[tokio::test]
    async fn test_process_handle_wait_error() {
        let mut mock_process = MockProcessHandle::new(vec![], Some(0));
        mock_process.set_wait_error(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Process wait failed",
        ));

        let result = Box::new(mock_process).wait().await;
        assert!(result.is_err());
        assert_matches!(result.unwrap_err(), HandlerError::Io(_));
    }

    impl MockProcessHandle {
        fn set_stdin_error(&mut self, error: io::Error) {
            self.stdin_error = Some(error);
        }

        fn set_stdout_error(&mut self, error: io::Error) {
            self.stdout_error = Some(error);
        }

        fn set_wait_error(&mut self, error: io::Error) {
            self.wait_error = Some(error);
        }
    }
}
