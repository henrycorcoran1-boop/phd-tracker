"""Feature engineering for bill-of-quantities line items.

The description text carries most of the price signal, so it is vectorised
twice — word n-grams for vocabulary and character n-grams for the typos,
abbreviations and size codes that word tokenisers mangle — then compressed with
an SVD so a gradient-boosted tree can consume it alongside the structured
columns (unit, quantity, mined dimensions, project type).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import OrdinalEncoder

from .normalise import DIMENSION_COLUMNS, extract_dimensions, normalise_text

CATEGORICAL_COLUMNS = ("unit", "category", "project_type")


#: Columns whose presence means a frame has already been through
#: :func:`prepare_frame`.
_PREPARED_MARKERS = ("text", "log_quantity", "n_words") + DIMENSION_COLUMNS


def prepare_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Add derived text/dimension columns used by every model in the package.

    A single prediction touches this on four different paths (features, novelty
    search, lookup fallback, quantity check). Re-normalising thousands of
    descriptions each time is pure waste, so an already-prepared frame is
    returned untouched.
    """
    if all(column in frame.columns for column in _PREPARED_MARKERS):
        return frame
    out = frame.copy()
    for column, default in (
        ("description", ""),
        ("unit", "item"),
        ("category", "unknown"),
        ("project_type", "unknown"),
        ("quantity", 1.0),
    ):
        if column not in out.columns:
            out[column] = default
    out["description"] = out["description"].fillna("").astype(str)
    out["text"] = out["description"].map(normalise_text)
    out["quantity"] = pd.to_numeric(out["quantity"], errors="coerce").fillna(1.0)

    dims = pd.DataFrame(
        [extract_dimensions(text) for text in out["text"]],
        index=out.index,
        columns=list(DIMENSION_COLUMNS),
    )
    for column in DIMENSION_COLUMNS:
        out[column] = dims[column]

    out["n_words"] = out["text"].str.split().map(len).astype(float)
    out["log_quantity"] = np.log1p(out["quantity"].clip(lower=0.0))
    for column in CATEGORICAL_COLUMNS:
        out[column] = out[column].fillna("unknown").astype(str).str.strip().replace(
            "", "unknown"
        )
    return out


#: Columns read straight off the prepared frame. Quantity is deliberately not
#: among them — see :meth:`RateFeatureBuilder._quantity_block`.
NUMERIC_COLUMNS = ("n_words",) + DIMENSION_COLUMNS

#: Names of the two engineered quantity features, in the order they are stacked.
QUANTITY_COLUMNS = ("log_quantity_relative", "log_quantity_extremity")

_MIN_REFERENCE_SAMPLES = 5


class RateFeatureBuilder:
    """Fit/transform bundle turning prepared line items into a dense matrix."""

    def __init__(
        self,
        svd_components: int = 120,
        word_features: int = 40000,
        char_features: int = 60000,
        min_df: int = 1,
        random_state: int = 0,
    ) -> None:
        self.svd_components = svd_components
        self.word_features = word_features
        self.char_features = char_features
        self.min_df = min_df
        self.random_state = random_state

        self.word_vectorizer: TfidfVectorizer | None = None
        self.char_vectorizer: TfidfVectorizer | None = None
        self.svd: TruncatedSVD | None = None
        self.encoder: OrdinalEncoder | None = None
        self.feature_names_: list[str] = []
        #: (median, low, high) of log-quantity per item type, used to express
        #: quantity relative to what is normal *for that kind of item*.
        self.quantity_reference_: dict[object, tuple[float, float, float]] = {}

    # -- fitting ---------------------------------------------------------
    def fit(self, frame: pd.DataFrame) -> "RateFeatureBuilder":
        prepared = prepare_frame(frame)
        texts = prepared["text"].tolist()

        self.word_vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=self.word_features,
            min_df=self.min_df,
            sublinear_tf=True,
            strip_accents="unicode",
        )
        self.char_vectorizer = TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(3, 5),
            max_features=self.char_features,
            min_df=self.min_df,
            sublinear_tf=True,
        )
        word = self.word_vectorizer.fit_transform(texts)
        char = self.char_vectorizer.fit_transform(texts)
        text_matrix = sparse.hstack([word, char]).tocsr()

        n_components = _safe_components(
            self.svd_components, text_matrix.shape[0], text_matrix.shape[1]
        )
        if n_components:
            self.svd = TruncatedSVD(
                n_components=n_components, random_state=self.random_state
            )
            self.svd.fit(text_matrix)
        else:
            self.svd = None

        self.encoder = OrdinalEncoder(
            handle_unknown="use_encoded_value", unknown_value=-1
        )
        self.encoder.fit(prepared[list(CATEGORICAL_COLUMNS)])
        self.quantity_reference_ = self._fit_quantity_reference(prepared)

        self.feature_names_ = (
            [f"svd_{i}" for i in range(n_components)]
            + list(QUANTITY_COLUMNS)
            + list(NUMERIC_COLUMNS)
            + [f"cat_{c}" for c in CATEGORICAL_COLUMNS]
        )
        return self

    def _fit_quantity_reference(
        self, prepared: pd.DataFrame
    ) -> dict[object, tuple[float, float, float]]:
        """Record the typical log-quantity for each item type.

        Absolute quantity is a trap as a feature: across a bill it mostly
        encodes *what kind of item* this is (bulk surfacing runs to thousands of
        m2, transformers come in ones and twos), so a tree that splits on it
        happily prices a 200-off order of lighting columns like a bulk
        commodity. Measuring quantity against what is normal for that item type
        keeps the genuine economy-of-scale signal and drops the proxy.
        """
        reference: dict[object, tuple[float, float, float]] = {}
        log_quantity = prepared["log_quantity"]
        reference["__global__"] = _spread(log_quantity)
        for keys, group in prepared.groupby(["category", "unit"], sort=False):
            if len(group) >= _MIN_REFERENCE_SAMPLES:
                reference[tuple(keys)] = _spread(group["log_quantity"])
        for unit, group in prepared.groupby("unit", sort=False):
            if len(group) >= _MIN_REFERENCE_SAMPLES:
                reference[str(unit)] = _spread(group["log_quantity"])
        return reference

    def _quantity_block(self, prepared: pd.DataFrame) -> np.ndarray:
        """Quantity relative to its item type, plus how far outside the range."""
        reference = self.quantity_reference_ or {"__global__": (0.0, 0.0, 0.0)}
        fallback = reference.get("__global__", (0.0, 0.0, 0.0))
        relative = np.empty(len(prepared), dtype=float)
        extremity = np.empty(len(prepared), dtype=float)
        for position, row in enumerate(
            zip(prepared["category"], prepared["unit"], prepared["log_quantity"])
        ):
            category, unit, value = row
            median, low, high = (
                reference.get((category, unit))
                or reference.get(str(unit))
                or fallback
            )
            relative[position] = value - median
            extremity[position] = max(0.0, value - high, low - value)
        return np.column_stack([relative, extremity])

    def quantity_extremity(self, frame: pd.DataFrame) -> np.ndarray:
        """How far each quantity falls outside its item type's observed range."""
        return self._quantity_block(prepare_frame(frame))[:, 1]

    # -- transforming ----------------------------------------------------
    def transform(self, frame: pd.DataFrame) -> np.ndarray:
        if self.word_vectorizer is None or self.encoder is None:
            raise RuntimeError("RateFeatureBuilder.fit must be called first")
        prepared = prepare_frame(frame)
        blocks: list[np.ndarray] = []

        if self.svd is not None:
            blocks.append(self.svd.transform(self._text_matrix(prepared)))
        blocks.append(self._quantity_block(prepared))
        blocks.append(prepared[list(NUMERIC_COLUMNS)].to_numpy(dtype=float))
        blocks.append(
            self.encoder.transform(prepared[list(CATEGORICAL_COLUMNS)]).astype(float)
        )
        return np.hstack(blocks)

    def fit_transform(self, frame: pd.DataFrame) -> np.ndarray:
        return self.fit(frame).transform(frame)

    def word_matrix(self, frame: pd.DataFrame) -> sparse.csr_matrix:
        """Word-level TF-IDF only — used for nearest-neighbour novelty checks."""
        if self.word_vectorizer is None:
            raise RuntimeError("RateFeatureBuilder.fit must be called first")
        prepared = prepare_frame(frame)
        return self.word_vectorizer.transform(prepared["text"].tolist())

    # -- internals -------------------------------------------------------
    def _text_matrix(self, prepared: pd.DataFrame) -> sparse.csr_matrix:
        texts = prepared["text"].tolist()
        word = self.word_vectorizer.transform(texts)
        char = self.char_vectorizer.transform(texts)
        return sparse.hstack([word, char]).tocsr()


def _spread(values: pd.Series) -> tuple[float, float, float]:
    """Median and 5th/95th percentiles of a log-quantity series."""
    array = values.to_numpy(dtype=float)
    median, low, high = np.percentile(array, [50, 5, 95])
    return float(median), float(low), float(high)


def _safe_components(requested: int, n_samples: int, n_features: int) -> int:
    """TruncatedSVD needs components strictly below both matrix dimensions."""
    ceiling = min(n_samples - 1, n_features - 1)
    if ceiling < 2:
        return 0
    return int(max(2, min(requested, ceiling)))
