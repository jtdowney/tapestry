use futures_util::StreamExt;
use tapestry_host::{
    Request,
    codec::NativeMessagingCodec,
    handlers::{FabricCommandRunner, handle_request},
};
use tokio::io::{stdin, stdout};
use tokio_util::codec::{FramedRead, FramedWrite};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let stdin = stdin();
    let stdout = stdout();

    let read_codec = NativeMessagingCodec::<Request>::default();
    let write_codec = NativeMessagingCodec::<tapestry_host::Response>::default();

    let mut input = FramedRead::new(stdin, read_codec);
    let mut output = FramedWrite::new(stdout, write_codec);

    while let Some(message) = input.next().await {
        match message {
            Ok(request) => {
                if let Err(e) =
                    handle_request(&mut output, request, |p| FabricCommandRunner::new(p)).await
                {
                    eprintln!("Error handling request: {e}");
                }
            }
            Err(e) => eprintln!("Error reading message: {e}"),
        }
    }

    Ok(())
}
