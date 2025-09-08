use std::{collections::HashMap, sync::Arc};

use futures_util::StreamExt;
use tapestry_host::{
    Request,
    codec::NativeMessagingCodec,
    handlers::{FabricCommandRunner, ProcessRegistry, handle_request},
};
use tokio::{
    io::{stdin, stdout},
    sync::Mutex,
};
use tokio_util::codec::{FramedRead, FramedWrite};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let stdin = stdin();
    let stdout = stdout();

    let read_codec = NativeMessagingCodec::<Request>::default();
    let write_codec = NativeMessagingCodec::<tapestry_host::Response>::default();

    let mut input = FramedRead::new(stdin, read_codec);
    let output = FramedWrite::new(stdout, write_codec);
    let output_shared = Arc::new(Mutex::new(output));

    let process_registry: ProcessRegistry = Arc::new(Mutex::new(HashMap::new()));

    while let Some(message) = input.next().await {
        if let Ok(request) = message {
            let output_clone = output_shared.clone();
            let process_registry_clone = process_registry.clone();

            if let tapestry_host::RequestPayload::CancelProcess {
                request_id: target_id,
            } = &request.payload
            {
                let target_id = *target_id;
                let registry = process_registry_clone.lock().await;
                if let Some(cancel_sender) = registry.get(&target_id) {
                    let _ = cancel_sender.send(true);
                }
                drop(registry);
            }

            tokio::spawn(async move {
                let mut output_guard = output_clone.lock().await;
                if let Err(_e) = handle_request(
                    &mut *output_guard,
                    request,
                    |p| FabricCommandRunner::new(p),
                    process_registry_clone,
                )
                .await
                {}
            });
        }
    }

    Ok(())
}
