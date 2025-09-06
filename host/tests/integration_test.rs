use std::{
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
};

use bytes::BytesMut;
use camino::Utf8PathBuf;
use tapestry_host::{
    Request, RequestPayload, Response, ResponsePayload,
    handlers::{
        FabricCommandRunner, handle_list_patterns, handle_ping, handle_process_content,
        handle_request, resolve_path,
    },
};
use tokio::io::AsyncWrite;
use tokio_util::codec::{Encoder, FramedWrite};
use uuid::Uuid;

struct TestWriter {
    messages: Arc<std::sync::Mutex<Vec<Response>>>,
}

impl TestWriter {
    fn new() -> Self {
        Self {
            messages: Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }
}

impl AsyncWrite for TestWriter {
    fn poll_write(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        _buf: &[u8],
    ) -> Poll<Result<usize, std::io::Error>> {
        Poll::Ready(Ok(0))
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Result<(), std::io::Error>> {
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
    ) -> Poll<Result<(), std::io::Error>> {
        Poll::Ready(Ok(()))
    }
}

struct TestEncoder {
    messages: Arc<std::sync::Mutex<Vec<Response>>>,
}

impl TestEncoder {
    fn new(messages: Arc<std::sync::Mutex<Vec<Response>>>) -> Self {
        Self { messages }
    }
}

impl Encoder<Response> for TestEncoder {
    type Error = std::io::Error;

    fn encode(&mut self, item: Response, _dst: &mut BytesMut) -> Result<(), Self::Error> {
        self.messages.lock().unwrap().push(item);
        Ok(())
    }
}

fn fabric_available() -> bool {
    which::which("fabric-ai").is_ok()
}

#[tokio::test]
async fn test_real_command_runner_ping() {
    if !fabric_available() {
        eprintln!("Skipping test: fabric-ai not found in PATH");
        return;
    }

    let resolved_path = resolve_path::<Utf8PathBuf>(None).unwrap();
    let runner = FabricCommandRunner::new(resolved_path.clone());

    let test_writer = TestWriter::new();
    let messages = test_writer.messages.clone();
    let encoder = TestEncoder::new(messages.clone());
    let mut writer = FramedWrite::new(test_writer, encoder);

    let request_id = Uuid::new_v4();
    let result = handle_ping(&mut writer, request_id, &runner).await;
    assert!(result.is_ok());

    let messages = messages.lock().unwrap();
    assert_eq!(messages.len(), 1);

    if let ResponsePayload::Pong {
        valid,
        resolved_path,
        version,
    } = &messages[0].payload
    {
        assert!(valid);
        assert!(resolved_path.is_some());
        assert!(version.is_some());
        assert!(version.as_ref().unwrap().contains('v'));
    } else {
        panic!("Expected Pong response");
    }
}

#[tokio::test]
async fn test_real_command_runner_list_patterns() {
    if !fabric_available() {
        eprintln!("Skipping test: fabric-ai not found in PATH");
        return;
    }

    let resolved_path = resolve_path::<Utf8PathBuf>(None).unwrap();
    let runner = FabricCommandRunner::new(resolved_path.clone());

    let test_writer = TestWriter::new();
    let messages = test_writer.messages.clone();
    let encoder = TestEncoder::new(messages.clone());
    let mut writer = FramedWrite::new(test_writer, encoder);

    let request_id = Uuid::new_v4();
    let result = handle_list_patterns(&mut writer, request_id, &runner).await;
    assert!(result.is_ok());

    let messages = messages.lock().unwrap();
    assert_eq!(messages.len(), 1);

    match &messages[0].payload {
        ResponsePayload::PatternsList { patterns } => {
            assert!(
                !patterns.is_empty(),
                "Expected at least one pattern from fabric-ai"
            );
            eprintln!("Found {} patterns", patterns.len());
        }
        ResponsePayload::Error { message } => {
            eprintln!("fabric-ai error: {message}");
        }
        _ => panic!("Expected PatternsList or Error response"),
    }
}

#[tokio::test]
async fn test_real_command_runner_process_content() {
    if !fabric_available() {
        eprintln!("Skipping test: fabric-ai not found in PATH");
        return;
    }

    let resolved_path = resolve_path::<Utf8PathBuf>(None).unwrap();
    let runner = FabricCommandRunner::new(resolved_path.clone());

    let test_writer = TestWriter::new();
    let messages = test_writer.messages.clone();
    let encoder = TestEncoder::new(messages.clone());
    let mut writer = FramedWrite::new(test_writer, encoder);

    let request_id = Uuid::new_v4();
    let content = "This is a test message to summarize.".to_string();

    let result = handle_process_content(
        &mut writer,
        request_id,
        &runner,
        None,
        None,
        None,
        Some("Say 'Hello World' and nothing else".to_string()),
        content,
    )
    .await;

    if result.is_err() {
        eprintln!("Process content failed: {result:?}");
        return;
    }

    let messages = messages.lock().unwrap();
    assert!(!messages.is_empty(), "Expected at least one message");

    let has_done = messages
        .iter()
        .any(|m| matches!(m.payload, ResponsePayload::Done { .. }));
    assert!(has_done, "Expected Done message");
}

#[tokio::test]
async fn test_real_command_runner_invalid_fabric_path() {
    let invalid_path = Utf8PathBuf::from("/nonexistent/fabric-ai");
    let runner_result = resolve_path(Some(&invalid_path));

    if fabric_available() {
        assert!(runner_result.is_ok());
        let resolved_path = runner_result.unwrap();
        let runner = FabricCommandRunner::new(resolved_path.clone());

        let test_writer = TestWriter::new();
        let messages = test_writer.messages.clone();
        let encoder = TestEncoder::new(messages.clone());
        let mut writer = FramedWrite::new(test_writer, encoder);

        let request_id = Uuid::new_v4();

        let result = handle_ping(&mut writer, request_id, &runner).await;
        assert!(result.is_ok());

        let messages = messages.lock().unwrap();
        assert_eq!(messages.len(), 1);

        if let ResponsePayload::Pong {
            valid,
            resolved_path,
            ..
        } = &messages[0].payload
        {
            assert!(valid);
            assert!(resolved_path.is_some());
            assert!(!resolved_path.as_ref().unwrap().contains("/nonexistent/"));
        } else {
            panic!("Expected Pong response");
        }
    } else {
        assert!(runner_result.is_err());
    }
}

#[tokio::test]
async fn test_resolve_path_with_which() {
    let result = resolve_path::<Utf8PathBuf>(None);

    if fabric_available() {
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.exists());
        assert!(path.to_string().contains("fabric"));
    } else {
        assert!(result.is_err());
    }
}

#[tokio::test]
async fn test_real_command_runner_with_valid_path() {
    if !fabric_available() {
        eprintln!("Skipping test: fabric-ai not found in PATH");
        return;
    }

    let fabric_path = which::which("fabric-ai").unwrap();
    let fabric_path = Utf8PathBuf::from_path_buf(fabric_path).unwrap();

    let runner = FabricCommandRunner::new(fabric_path.clone());
    let test_writer = TestWriter::new();
    let messages = test_writer.messages.clone();
    let encoder = TestEncoder::new(messages.clone());
    let mut writer = FramedWrite::new(test_writer, encoder);

    let request_id = Uuid::new_v4();

    let result = handle_ping(&mut writer, request_id, &runner).await;
    assert!(result.is_ok());

    let messages = messages.lock().unwrap();
    assert_eq!(messages.len(), 1);

    if let ResponsePayload::Pong {
        valid,
        resolved_path,
        version,
    } = &messages[0].payload
    {
        assert!(valid);
        assert_eq!(resolved_path.as_ref().unwrap(), &fabric_path.to_string());
        assert!(version.is_some());
    } else {
        panic!("Expected Pong response");
    }
}

#[tokio::test]
async fn test_handle_request_with_real_runner() {
    if !fabric_available() {
        eprintln!("Skipping test: fabric-ai not found in PATH");
        return;
    }

    let test_writer = TestWriter::new();
    let messages = test_writer.messages.clone();
    let encoder = TestEncoder::new(messages.clone());
    let mut writer = FramedWrite::new(test_writer, encoder);

    let request = Request {
        id: Uuid::new_v4(),
        path: None,
        payload: RequestPayload::Ping,
    };

    let result = handle_request(&mut writer, request, |path| FabricCommandRunner::new(path)).await;
    assert!(result.is_ok());

    let messages = messages.lock().unwrap();
    assert_eq!(messages.len(), 1);
    assert!(matches!(messages[0].payload, ResponsePayload::Pong { .. }));
}

#[tokio::test]
async fn test_process_content_with_pattern() {
    if !fabric_available() {
        eprintln!("Skipping test: fabric-ai not found in PATH");
        return;
    }

    let resolved_path = resolve_path::<Utf8PathBuf>(None).unwrap();
    let runner = FabricCommandRunner::new(resolved_path.clone());

    let test_writer = TestWriter::new();
    let messages = test_writer.messages.clone();
    let encoder = TestEncoder::new(messages.clone());
    let mut writer = FramedWrite::new(test_writer, encoder);

    let request_id = Uuid::new_v4();
    let _ = handle_list_patterns(&mut writer, request_id, &runner).await;

    let available_patterns = {
        let messages = messages.lock().unwrap();
        if let ResponsePayload::PatternsList { patterns } = &messages[0].payload {
            patterns.clone()
        } else {
            vec![]
        }
    };

    if available_patterns.is_empty() {
        eprintln!("No patterns available, skipping pattern test");
        return;
    }

    let pattern = available_patterns[0].clone();
    eprintln!("Testing with pattern: {pattern}");

    let test_writer2 = TestWriter::new();
    let messages2 = test_writer2.messages.clone();
    let encoder2 = TestEncoder::new(messages2.clone());
    let mut writer2 = FramedWrite::new(test_writer2, encoder2);

    let request_id = Uuid::new_v4();
    let content = "This is test content for fabric processing.".to_string();

    let result = handle_process_content(
        &mut writer2,
        request_id,
        &runner,
        None,
        Some(pattern),
        None,
        None,
        content,
    )
    .await;

    if result.is_err() {
        eprintln!("Process with pattern failed (likely no model configured): {result:?}");
    } else {
        let messages = messages2.lock().unwrap();
        assert!(!messages.is_empty());
        let has_done = messages
            .iter()
            .any(|m| matches!(m.payload, ResponsePayload::Done { .. }));
        assert!(has_done);
    }
}
