use camino::Utf8PathBuf;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub mod codec;
pub mod fabric;
pub mod handlers;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub id: Uuid,
    pub path: Option<Utf8PathBuf>,
    #[serde(flatten)]
    pub payload: RequestPayload,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RequestPayload {
    #[serde(rename = "native.ping")]
    Ping,
    #[serde(rename = "native.listPatterns")]
    ListPatterns,
    #[serde(rename = "native.listContexts")]
    ListContexts,
    #[serde(rename = "native.processContent")]
    ProcessContent {
        content: String,
        model: Option<String>,
        pattern: Option<String>,
        context: Option<String>,
        custom_prompt: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub id: Uuid,
    #[serde(flatten)]
    pub payload: ResponsePayload,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ResponsePayload {
    #[serde(rename = "native.pong")]
    Pong {
        #[serde(rename = "resolvedPath")]
        resolved_path: Option<String>,
        version: Option<String>,
        valid: bool,
    },
    #[serde(rename = "native.content")]
    Content { content: String },
    #[serde(rename = "native.done")]
    Done {
        #[serde(rename = "exitCode")]
        exit_code: Option<i32>,
    },
    #[serde(rename = "native.error")]
    Error { message: String },
    #[serde(rename = "native.patternsList")]
    PatternsList { patterns: Vec<String> },
    #[serde(rename = "native.contextsList")]
    ContextsList { contexts: Vec<String> },
}

#[cfg(test)]
mod tests {
    use assert_matches::assert_matches;
    use camino::Utf8PathBuf;

    use super::*;

    #[test]
    fn test_list_patterns_request_serialization() {
        let request = Request {
            id: Uuid::new_v4(),
            path: None,
            payload: RequestPayload::ListPatterns,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"type\":\"native.listPatterns\""));
        assert!(json.contains("\"id\""));
    }

    #[test]
    fn test_list_patterns_request_deserialization() {
        let json = r#"{
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "type": "native.listPatterns"
        }"#;

        let request: Request = serde_json::from_str(json).unwrap();
        assert_eq!(
            request.id.to_string(),
            "550e8400-e29b-41d4-a716-446655440000"
        );
        assert_matches!(request.payload, RequestPayload::ListPatterns);
    }

    #[test]
    fn test_patterns_list_response_serialization() {
        let response = Response {
            id: Uuid::new_v4(),
            payload: ResponsePayload::PatternsList {
                patterns: vec!["pattern1".to_string(), "pattern2".to_string()],
            },
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"type\":\"native.patternsList\""));
        assert!(json.contains("\"patterns\""));
        assert!(json.contains("pattern1"));
        assert!(json.contains("pattern2"));
    }

    #[test]
    fn test_process_content_request() {
        let json = r#"{
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "path": "/usr/bin/fabric",
            "type": "native.processContent",
            "content": "test content",
            "model": "gpt-4",
            "pattern": "summarize"
        }"#;

        let request: Request = serde_json::from_str(json).unwrap();
        assert_eq!(request.path, Some(Utf8PathBuf::from("/usr/bin/fabric")));
        match request.payload {
            RequestPayload::ProcessContent {
                content,
                model,
                pattern,
                ..
            } => {
                assert_eq!(content, "test content");
                assert_eq!(model, Some("gpt-4".to_string()));
                assert_eq!(pattern, Some("summarize".to_string()));
            }
            _ => panic!("Expected ProcessContent request"),
        }
    }

    #[test]
    fn test_list_contexts_request_serialization() {
        let request = Request {
            id: Uuid::new_v4(),
            path: None,
            payload: RequestPayload::ListContexts,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"type\":\"native.listContexts\""));
        assert!(json.contains("\"id\""));
    }

    #[test]
    fn test_list_contexts_request_deserialization() {
        let json = r#"{
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "type": "native.listContexts"
        }"#;

        let request: Request = serde_json::from_str(json).unwrap();
        assert_eq!(
            request.id.to_string(),
            "550e8400-e29b-41d4-a716-446655440000"
        );
        assert_matches!(request.payload, RequestPayload::ListContexts);
    }

    #[test]
    fn test_contexts_list_response_serialization() {
        let response = Response {
            id: Uuid::new_v4(),
            payload: ResponsePayload::ContextsList {
                contexts: vec!["context1".to_string(), "context2".to_string()],
            },
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"type\":\"native.contextsList\""));
        assert!(json.contains("\"contexts\""));
        assert!(json.contains("context1"));
        assert!(json.contains("context2"));
    }

    #[test]
    fn test_process_content_with_context() {
        let json = r#"{
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "path": "/usr/bin/fabric",
            "type": "native.processContent",
            "content": "test content",
            "model": "gpt-4",
            "pattern": "summarize",
            "context": "tapestry"
        }"#;

        let request: Request = serde_json::from_str(json).unwrap();
        match request.payload {
            RequestPayload::ProcessContent {
                content,
                model,
                pattern,
                context,
                ..
            } => {
                assert_eq!(content, "test content");
                assert_eq!(model, Some("gpt-4".to_string()));
                assert_eq!(pattern, Some("summarize".to_string()));
                assert_eq!(context, Some("tapestry".to_string()));
            }
            _ => panic!("Expected ProcessContent request"),
        }
    }
}
