"""The vendored cl100k_base encoding must be byte-identical to OpenAI's.

tiktoken looks it up in TIKTOKEN_CACHE_DIR under the sha1 of its download URL,
so the chunker tests run without network access.
"""

import hashlib
import os
from pathlib import Path

import tiktoken

URL = "https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken"
# expected_hash for cl100k_base in tiktoken_ext/openai_public.py.
SHA256 = "223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7"
FIXTURE = Path(__file__).parent / "fixtures" / "tiktoken" / hashlib.sha1(URL.encode()).hexdigest()


def test_vendored_file_matches_tiktokens_pinned_hash():
    assert hashlib.sha256(FIXTURE.read_bytes()).hexdigest() == SHA256


def test_conftest_points_tiktoken_at_the_vendored_cache():
    assert Path(os.environ["TIKTOKEN_CACHE_DIR"]) == FIXTURE.parent
    assert tiktoken.get_encoding("cl100k_base").encode("hello world") == [15339, 1917]
