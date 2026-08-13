"""Chunker algorithm: paragraph, sentence and hard-token splitting, and overlap.

The real tokenizer downloads its encoding on first use, which makes these tests
depend on network access and on tiktoken's exact vocabulary. The algorithm is
what matters here, so these substitute a one-token-per-character encoding: it
round-trips exactly, so "tokens" read as characters and boundaries are easy to
state precisely. tests/test_knowledge.py still exercises the real encoding.
"""

import pytest

from app.knowledge import chunker


class _CharEncoding:
    """One token per character, with an exact round-trip."""

    def encode(self, text: str) -> list[int]:
        return [ord(c) for c in text]

    def decode(self, tokens: list[int]) -> str:
        return "".join(chr(t) for t in tokens)


@pytest.fixture(autouse=True)
def char_tokens(monkeypatch):
    monkeypatch.setattr(chunker, "_get_encoding", _CharEncoding)


# ─── count_tokens ────────────────────────────────────────────────────────────


def test_count_tokens_counts_the_encoding_units():
    assert chunker.count_tokens("abcd") == 4


def test_count_tokens_of_empty_text_is_zero():
    assert chunker.count_tokens("") == 0


# ─── chunk_text: trivial inputs ──────────────────────────────────────────────


@pytest.mark.parametrize("text", ["", "   ", "\n\n\t "])
def test_chunk_text_returns_nothing_for_blank_input(text):
    assert chunker.chunk_text(text) == []


def test_chunk_text_keeps_short_text_as_one_chunk():
    chunks = chunker.chunk_text("hello world", chunk_size=100, overlap=0)
    assert len(chunks) == 1
    assert chunks[0].content == "hello world"
    assert chunks[0].index == 0
    assert chunks[0].token_count == len("hello world")


def test_chunk_text_indexes_chunks_sequentially():
    text = "\n\n".join(f"paragraph {i}" for i in range(6))
    chunks = chunker.chunk_text(text, chunk_size=12, overlap=0)
    assert [c.index for c in chunks] == list(range(len(chunks)))


# ─── paragraph handling ──────────────────────────────────────────────────────


def test_paragraphs_are_packed_until_the_size_limit():
    text = "aaa\n\nbbb\n\nccc"
    chunks = chunker.chunk_text(text, chunk_size=100, overlap=0)
    assert len(chunks) == 1
    assert chunks[0].content == "aaa\n\nbbb\n\nccc"


def test_a_paragraph_that_would_overflow_starts_a_new_chunk():
    text = "aaaa\n\nbbbb"
    chunks = chunker.chunk_text(text, chunk_size=5, overlap=0)
    assert [c.content for c in chunks] == ["aaaa", "bbbb"]


def test_split_paragraphs_normalises_line_endings_and_drops_blanks():
    assert chunker._split_paragraphs("a\r\n\r\nb\n\n\n   \n\nc") == ["a", "b", "c"]


def test_split_paragraphs_of_blank_text_is_empty():
    assert chunker._split_paragraphs("   \n\n  ") == []


# ─── sentence handling ───────────────────────────────────────────────────────


def test_split_sentences_breaks_on_terminators_before_a_capital():
    assert chunker._split_sentences("One. Two! Three? Four") == [
        "One.", "Two!", "Three?", "Four",
    ]


def test_split_sentences_keeps_a_lowercase_continuation_together():
    assert chunker._split_sentences("Mr. smith went home") == ["Mr. smith went home"]


def test_an_oversized_paragraph_is_split_on_sentence_boundaries():
    para = "Aaaaaaaa. Bbbbbbbb. Cccccccc."
    chunks = chunker.chunk_text(para, chunk_size=20, overlap=0)
    assert len(chunks) > 1
    # Every piece stays within the limit.
    assert all(c.token_count <= 20 for c in chunks)


def test_split_oversized_packs_sentences_up_to_the_limit():
    out = chunker._split_oversized("Aaa. Bbb. Ccc.", chunk_size=9, overlap=0)
    assert out == ["Aaa. Bbb.", "Ccc."]


# ─── hard token splitting ────────────────────────────────────────────────────


def test_a_single_oversized_sentence_is_cut_by_tokens():
    out = chunker._split_oversized("x" * 25, chunk_size=10, overlap=0)
    assert out == ["x" * 10, "x" * 10, "x" * 5]


def test_hard_token_split_of_empty_text_yields_nothing():
    assert chunker._hard_token_split("", chunk_size=10, overlap=0) == []


def test_hard_token_split_overlaps_consecutive_pieces():
    pieces = chunker._hard_token_split("abcdefghij", chunk_size=5, overlap=2)
    # Step is chunk_size - overlap = 3.
    assert pieces == ["abcde", "defgh", "ghij"]


def test_hard_token_split_stops_at_the_final_piece():
    pieces = chunker._hard_token_split("abcdef", chunk_size=6, overlap=2)
    assert pieces == ["abcdef"]


def test_hard_token_split_survives_an_overlap_larger_than_the_chunk():
    # step would be <= 0; the implementation floors it at 1 rather than looping.
    pieces = chunker._hard_token_split("abc", chunk_size=2, overlap=5)
    assert pieces[0] == "ab"
    assert len(pieces) <= 3


def test_an_oversized_sentence_flushes_the_buffer_before_splitting():
    # The capital starts a new sentence; a lowercase run would stay joined.
    out = chunker._split_oversized("Aaa. " + "X" * 25, chunk_size=10, overlap=0)
    assert out[0] == "Aaa."
    assert "".join(out[1:]) == "X" * 25


# ─── overlap carrying ────────────────────────────────────────────────────────


def test_carry_overlap_returns_nothing_when_overlap_is_disabled():
    assert chunker._carry_overlap(["abcdef"], 0) == ([], 0)


def test_carry_overlap_returns_nothing_for_an_empty_buffer():
    assert chunker._carry_overlap([], 5) == ([], 0)


def test_carry_overlap_keeps_the_whole_buffer_when_it_is_shorter_than_the_overlap():
    carried, count = chunker._carry_overlap(["abc"], 10)
    assert carried == ["abc"]
    assert count == 3


def test_carry_overlap_keeps_only_the_tail_when_the_buffer_is_longer():
    carried, count = chunker._carry_overlap(["abcdefghij"], 4)
    assert carried == ["ghij"]
    assert count == 4


def test_carry_overlap_joins_a_multi_paragraph_buffer_before_trimming():
    carried, _ = chunker._carry_overlap(["aaa", "bbb"], 3)
    assert carried == ["bbb"]


def test_consecutive_chunks_share_their_overlap():
    text = "\n\n".join(["a" * 8, "b" * 8, "c" * 8])
    chunks = chunker.chunk_text(text, chunk_size=10, overlap=4)
    assert len(chunks) > 1
    # The tail of one chunk opens the next.
    assert chunks[1].content.startswith(chunks[0].content[-4:])


# ─── _make_chunk ─────────────────────────────────────────────────────────────


def test_make_chunk_joins_paragraphs_and_counts_the_result():
    chunk = chunker._make_chunk(3, ["aaa", "bbb"])
    assert chunk.index == 3
    assert chunk.content == "aaa\n\nbbb"
    assert chunk.token_count == len("aaa\n\nbbb")


# ─── whole-document behaviour ────────────────────────────────────────────────


def test_chunking_preserves_every_word_of_the_source():
    text = "\n\n".join(f"Paragraph number {i} with some words." for i in range(10))
    chunks = chunker.chunk_text(text, chunk_size=40, overlap=0)
    joined = " ".join(c.content for c in chunks)
    for i in range(10):
        assert f"Paragraph number {i}" in joined


def test_every_chunk_reports_its_own_token_count():
    text = "\n\n".join("word " * 5 for _ in range(5))
    for chunk in chunker.chunk_text(text, chunk_size=30, overlap=0):
        assert chunk.token_count == chunker.count_tokens(chunk.content)


def test_default_sizes_are_the_documented_ones():
    assert chunker.CHUNK_SIZE_TOKENS == 512
    assert chunker.CHUNK_OVERLAP_TOKENS == 50
    assert chunker.ENCODING_NAME == "cl100k_base"


def test_a_pending_paragraph_is_flushed_before_an_oversized_one_is_split():
    # "aaa" is buffered, then the long paragraph exceeds the size on its own —
    # the buffer has to be emitted as its own chunk before the split happens.
    text = "aaa\n\n" + "B" * 30
    chunks = chunker.chunk_text(text, chunk_size=10, overlap=0)
    assert chunks[0].content == "aaa"
    assert "".join(c.content for c in chunks[1:]) == "B" * 30


def test_the_flushed_buffer_carries_overlap_into_the_oversized_split():
    text = "aaaaaa\n\n" + "B" * 30
    chunks = chunker.chunk_text(text, chunk_size=10, overlap=3)
    assert chunks[0].content == "aaaaaa"
    assert len(chunks) > 1
