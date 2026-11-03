Vendored `cl100k_base` BPE for tiktoken (AUDIT F-09).

`TIKTOKEN_CACHE_DIR` is pointed here by `app/knowledge/chunker.py` so
`tiktoken.get_encoding("cl100k_base")` works offline in tests and CI.
Do not delete the hash-named file; regenerating it requires network access to
`openaipublic.blob.core.windows.net`.
