use std::process::Stdio;

use camino::Utf8Path;
use tokio::process::Command;

pub struct FabricCommandBuilder<'a> {
    fabric_path: &'a Utf8Path,
    args: Vec<String>,
    stdin: Option<Stdio>,
    stdout: Option<Stdio>,
    stderr: Option<Stdio>,
}

impl<'a> FabricCommandBuilder<'a> {
    pub fn new(fabric_path: &'a Utf8Path) -> Self {
        Self {
            fabric_path,
            args: Vec::new(),
            stdin: None,
            stdout: None,
            stderr: None,
        }
    }

    pub fn version(mut self) -> Self {
        self.args.push("--version".to_string());
        self
    }

    pub fn list_patterns(mut self) -> Self {
        self.args.push("--listpatterns".to_string());
        self
    }

    pub fn stream(mut self) -> Self {
        self.args.push("--stream".to_string());
        self
    }

    pub fn model<S: Into<String>>(mut self, model: S) -> Self {
        self.args.push("--model".to_string());
        self.args.push(model.into());
        self
    }

    pub fn pattern<S: Into<String>>(mut self, pattern: S) -> Self {
        self.args.push("--pattern".to_string());
        self.args.push(pattern.into());
        self
    }

    pub fn custom_prompt<S: Into<String>>(mut self, prompt: S) -> Self {
        self.args.push(prompt.into());
        self
    }

    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.args.extend(args.into_iter().map(Into::into));
        self
    }

    pub fn stdin(mut self, stdin: Stdio) -> Self {
        self.stdin = Some(stdin);
        self
    }

    pub fn stdout(mut self, stdout: Stdio) -> Self {
        self.stdout = Some(stdout);
        self
    }

    pub fn stderr(mut self, stderr: Stdio) -> Self {
        self.stderr = Some(stderr);
        self
    }

    pub fn build(self) -> Command {
        let mut command = Command::new(self.fabric_path.as_str());

        for arg in self.args {
            command.arg(arg);
        }

        if let Some(stdin) = self.stdin {
            command.stdin(stdin);
        }

        if let Some(stdout) = self.stdout {
            command.stdout(stdout);
        }

        if let Some(stderr) = self.stderr {
            command.stderr(stderr);
        }

        command
    }
}

#[cfg(test)]
mod tests {
    use std::process::Stdio;

    use camino::Utf8PathBuf;

    use super::*;

    #[test]
    fn test_builder_new() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path);

        assert_eq!(builder.fabric_path, &path);
        assert!(builder.args.is_empty());
        assert!(builder.stdin.is_none());
        assert!(builder.stdout.is_none());
        assert!(builder.stderr.is_none());
    }

    #[test]
    fn test_builder_version() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path).version();

        assert_eq!(builder.args, vec!["--version"]);
    }

    #[test]
    fn test_builder_list_patterns() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path).list_patterns();

        assert_eq!(builder.args, vec!["--listpatterns"]);
    }

    #[test]
    fn test_builder_stream() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path).stream();

        assert_eq!(builder.args, vec!["--stream"]);
    }

    #[test]
    fn test_builder_model() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path).model("gpt-4");

        assert_eq!(builder.args, vec!["--model", "gpt-4"]);
    }

    #[test]
    fn test_builder_pattern() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path).pattern("summarize");

        assert_eq!(builder.args, vec!["--pattern", "summarize"]);
    }

    #[test]
    fn test_builder_custom_prompt() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path).custom_prompt("custom prompt");

        assert_eq!(builder.args, vec!["custom prompt"]);
    }

    #[test]
    fn test_builder_args() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder =
            FabricCommandBuilder::new(&path).args(["--arg1", "value1", "--arg2", "value2"]);

        assert_eq!(builder.args, vec!["--arg1", "value1", "--arg2", "value2"]);
    }

    #[test]
    fn test_builder_chain() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path)
            .stream()
            .model("gpt-4")
            .pattern("summarize");

        assert_eq!(
            builder.args,
            vec!["--stream", "--model", "gpt-4", "--pattern", "summarize"]
        );
    }

    #[test]
    fn test_builder_stdio_configuration() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        assert!(builder.stdin.is_some());
        assert!(builder.stdout.is_some());
        assert!(builder.stderr.is_some());
    }

    #[test]
    fn test_builder_build_creates_command() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let command = FabricCommandBuilder::new(&path).version().build();

        assert_eq!(command.as_std().get_program(), path.as_str());
    }

    #[test]
    fn test_builder_model_and_pattern() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path)
            .model("gpt-4")
            .pattern("summarize");

        assert_eq!(
            builder.args,
            vec!["--model", "gpt-4", "--pattern", "summarize"]
        );
    }

    #[test]
    fn test_builder_empty_args() {
        let path = Utf8PathBuf::from("/usr/bin/fabric-ai");
        let builder = FabricCommandBuilder::new(&path);

        assert!(builder.args.is_empty());
    }
}
