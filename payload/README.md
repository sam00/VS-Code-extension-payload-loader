# Payload Directory

Place your compiled payload binary here as `agent` before building:

```bash
cp /path/to/your/compiled/agent ./payload/agent
```

Or use the `PAYLOAD_SOURCE` env var:

```bash
PAYLOAD_SOURCE=/path/to/your/agent bash build_extension.sh
```

The binary is gitignored and will NOT be committed to the repository.
