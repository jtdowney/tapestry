use std::{io, marker::PhantomData};

use bytes::{Buf, BufMut, BytesMut};
use serde::{Serialize, de::DeserializeOwned};
use thiserror::Error;
use tokio_util::codec::{Decoder, Encoder};

const MAX_MESSAGE_SIZE: usize = 1024 * 1024;

#[derive(Debug, Error)]
pub enum CodecError {
    #[error("IO error")]
    IoError(#[from] io::Error),
    #[error("Message size {size} exceeds limit {limit}")]
    MessageTooLarge { size: usize, limit: usize },
    #[error("Serialization error: {0}")]
    SerdeError(#[from] serde_json::Error),
    #[error("Invalid message length bytes")]
    InvalidMessageLength,
}

pub struct NativeMessagingCodec<T> {
    max_message_size: usize,
    _phantom: PhantomData<T>,
}

impl<T> Default for NativeMessagingCodec<T> {
    fn default() -> Self {
        Self {
            max_message_size: MAX_MESSAGE_SIZE,
            _phantom: PhantomData,
        }
    }
}

impl<T> Encoder<T> for NativeMessagingCodec<T>
where
    T: Serialize,
{
    type Error = CodecError;

    fn encode(&mut self, item: T, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let json = serde_json::to_string(&item)?;
        let json_bytes = json.as_bytes();

        if json_bytes.len() > self.max_message_size {
            return Err(CodecError::MessageTooLarge {
                size: json_bytes.len(),
                limit: self.max_message_size,
            });
        }

        #[allow(clippy::cast_possible_truncation)]
        let length = json_bytes.len() as u32;
        dst.put_u32_le(length);
        dst.put_slice(json_bytes);

        Ok(())
    }
}

impl<T> Decoder for NativeMessagingCodec<T>
where
    T: DeserializeOwned,
{
    type Item = T;
    type Error = CodecError;

    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        if src.len() < 4 {
            return Ok(None);
        }

        let length_bytes: [u8; 4] = src[0..4].try_into().unwrap();
        let message_length = u32::from_le_bytes(length_bytes) as usize;

        if message_length > self.max_message_size {
            return Err(CodecError::MessageTooLarge {
                size: message_length,
                limit: self.max_message_size,
            });
        }

        let total_length = 4 + message_length;
        if src.len() < total_length {
            return Ok(None);
        }

        src.advance(4);
        let json_bytes = src.split_to(message_length);
        let message: T = serde_json::from_slice(&json_bytes)?;
        Ok(Some(message))
    }
}

#[cfg(test)]
mod tests {
    use std::marker::PhantomData;

    use assert_matches::assert_matches;
    use serde::{Deserialize, Serialize};

    use super::*;

    #[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
    struct TestMessage {
        text: String,
        number: i32,
    }

    #[test]
    fn test_encode_message() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();
        let message = TestMessage {
            text: "hello".to_string(),
            number: 42,
        };
        let mut buf = BytesMut::new();

        codec
            .encode(message, &mut buf)
            .expect("encoding should succeed");

        assert!(buf.len() >= 4);

        let length = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
        let expected_json = r#"{"text":"hello","number":42}"#;
        assert_eq!(length, expected_json.len());

        assert_eq!(buf.len(), 4 + expected_json.len());

        let json_payload = std::str::from_utf8(&buf[4..]).expect("valid UTF-8");
        assert_eq!(json_payload, expected_json);
    }

    #[test]
    fn test_decode_message() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();

        let json = r#"{"text":"world","number":123}"#;
        let json_bytes = json.as_bytes();
        #[allow(clippy::cast_possible_truncation)]
        let length = json_bytes.len() as u32;

        let mut src = BytesMut::new();
        src.put_u32_le(length);
        src.put_slice(json_bytes);

        let decoded = codec.decode(&mut src).expect("decoding should succeed");
        let message = decoded.expect("should have a message");
        assert_eq!(message.text, "world");
        assert_eq!(message.number, 123);
        assert!(src.is_empty());
    }

    #[test]
    fn test_decode_partial_message() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();

        let mut src = BytesMut::new();
        src.put_u32_le(20);

        let result = codec.decode(&mut src).expect("decode should not fail");
        assert!(result.is_none());
        assert_eq!(src.len(), 4);
    }

    #[test]
    fn test_decode_message_too_large() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();

        let mut src = BytesMut::new();
        #[allow(clippy::cast_possible_truncation)]
        let len = (MAX_MESSAGE_SIZE + 1) as u32;
        src.put_u32_le(len);

        let result = codec.decode(&mut src);
        assert_matches!(result, Err(CodecError::MessageTooLarge { .. }));
    }

    #[test]
    fn test_decode_invalid_json() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();

        let invalid_json = b"not valid json";
        let mut src = BytesMut::new();
        #[allow(clippy::cast_possible_truncation)]
        let len = invalid_json.len() as u32;
        src.put_u32_le(len);
        src.put_slice(invalid_json);

        let result = codec.decode(&mut src);
        assert_matches!(result, Err(CodecError::SerdeError(_)));
    }

    #[test]
    fn test_decode_zero_length_message() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();

        let mut src = BytesMut::new();
        src.put_u32_le(0);

        let result = codec.decode(&mut src);
        assert_matches!(result, Err(CodecError::SerdeError(_)));
    }

    #[test]
    fn test_round_trip() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();
        let message = TestMessage {
            text: "hello".to_string(),
            number: 42,
        };
        let mut buf = BytesMut::new();
        codec
            .encode(message.clone(), &mut buf)
            .expect("encode should succeed");

        let decoded = codec
            .decode(&mut buf)
            .expect("decode should succeed")
            .expect("should have message");
        assert_eq!(decoded, message);
    }

    #[test]
    fn test_codec_error_invalid_message_length() {
        let error = CodecError::InvalidMessageLength;
        assert_eq!(error.to_string(), "Invalid message length bytes");
    }

    #[test]
    fn test_encode_message_too_large() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec {
            max_message_size: 10,
            _phantom: PhantomData,
        };

        let message = TestMessage {
            text: "This is a very long message that exceeds the limit".to_string(),
            number: 42,
        };
        let mut buf = BytesMut::new();

        let result = codec.encode(message, &mut buf);
        assert_matches!(result, Err(CodecError::MessageTooLarge { .. }));
    }

    #[test]
    fn test_decode_handles_length_bytes_safely() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();
        let mut buf = BytesMut::new();

        buf.extend_from_slice(&[1, 2, 3]);
        let result = codec.decode(&mut buf);
        assert!(matches!(result, Ok(None)));
        buf.clear();

        let json = r#"{"text":"hi","number":1}"#;
        #[allow(clippy::cast_possible_truncation)]
        let len_bytes = (json.len() as u32).to_le_bytes();
        buf.extend_from_slice(&len_bytes);
        buf.extend_from_slice(json.as_bytes());
        let result = codec.decode(&mut buf);
        assert!(result.is_ok());
    }

    #[test]
    fn test_decode_malformed_length_prefix() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();
        let mut src = BytesMut::new();

        src.put_slice(&[0x01, 0x02, 0x03]);

        let result = codec.decode(&mut src);
        assert!(matches!(result, Ok(None)));
        assert_eq!(src.len(), 3);
    }

    #[test]
    fn test_decode_buffer_underrun() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();
        let mut src = BytesMut::new();

        src.put_u32_le(10);
        src.put_slice(b"hello");

        let result = codec.decode(&mut src);
        assert!(matches!(result, Ok(None)));
        assert_eq!(src.len(), 9);
    }

    #[test]
    fn test_encode_serialization_error() {
        let io_error = std::io::Error::other("test error");
        let error = CodecError::SerdeError(serde_json::Error::io(io_error));
        assert!(error.to_string().contains("Serialization error"));
    }

    #[test]
    fn test_encode_output_buffer_handling() {
        let mut codec: NativeMessagingCodec<TestMessage> = NativeMessagingCodec::default();
        let message = TestMessage {
            text: "test".to_string(),
            number: 1,
        };
        let mut buf = BytesMut::with_capacity(1);
        let result = codec.encode(message, &mut buf);
        assert!(result.is_ok());
        assert!(buf.len() > 1);
    }

    #[test]
    fn test_message_size_boundary_conditions() {
        let mut codec = NativeMessagingCodec::<TestMessage> {
            max_message_size: 100,
            _phantom: PhantomData,
        };

        let mut src = BytesMut::new();
        src.put_u32_le(100);
        src.put_slice(&[b'x'; 100]);

        let result = codec.decode(&mut src);
        assert_matches!(result, Err(CodecError::SerdeError(_)));

        let mut src = BytesMut::new();
        src.put_u32_le(101);

        let result = codec.decode(&mut src);
        assert_matches!(
            result,
            Err(CodecError::MessageTooLarge {
                size: 101,
                limit: 100
            })
        );
    }
}
