"""The learned components: work-package classifier, rate model, parametric check.

Three models, each doing one job:

``CategoryModel``
    Text classifier mapping an item description onto a work package. Gives the
    estimate a breakdown a QS can argue with, and feeds the rate model.

``RateModel``
    Quantile gradient boosting on ``log(base unit rate)``. Predicting three
    quantiles rather than a point gives every line an honest band, which is the
    whole point of an order-of-magnitude estimate. A hierarchical median lookup
    backs it up for items the training corpus has never seen.

``ParametricTotalModel``
    A top-down sanity check: project drivers -> total value. When the bottom-up
    build-up and the parametric model disagree badly, something is wrong with
    the take-off, and the estimate says so.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import NearestNeighbors
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OrdinalEncoder

from .features import RateFeatureBuilder, prepare_frame

#: log(P90) - log(P10) for a standard normal, used to convert a predicted
#: quantile spread into a log-scale sigma.
_P10_P90_Z = 2.5631


class CategoryModel:
    """TF-IDF + multinomial logistic regression over item descriptions."""

    def __init__(self, random_state: int = 0) -> None:
        self.random_state = random_state
        self.pipeline = None
        self.classes_: np.ndarray = np.array([])
        self.fallback_ = "Unclassified"

    def clone_unfitted(self) -> "CategoryModel":
        return CategoryModel(random_state=self.random_state)

    def fit(self, frame: pd.DataFrame, labels: pd.Series) -> "CategoryModel":
        prepared = prepare_frame(frame)
        labels = labels.fillna("Unclassified").astype(str)
        self.fallback_ = labels.mode().iat[0] if len(labels) else "Unclassified"
        if labels.nunique() < 2:
            self.pipeline = None
            self.classes_ = np.array(sorted(labels.unique()))
            return self

        self.pipeline = make_pipeline(
            TfidfVectorizer(
                ngram_range=(1, 2), sublinear_tf=True, min_df=1, strip_accents="unicode"
            ),
            LogisticRegression(
                C=4.0, max_iter=3000, class_weight="balanced",
                random_state=self.random_state,
            ),
        )
        self.pipeline.fit(prepared["text"].tolist(), labels.tolist())
        self.classes_ = self.pipeline.classes_
        return self

    def predict(self, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        """Return ``(labels, confidence)`` where confidence is the top class probability."""
        prepared = prepare_frame(frame)
        n = len(prepared)
        if self.pipeline is None:
            return (
                np.array([self.fallback_] * n, dtype=object),
                np.zeros(n, dtype=float),
            )
        probabilities = self.pipeline.predict_proba(prepared["text"].tolist())
        best = probabilities.argmax(axis=1)
        return self.classes_[best], probabilities[np.arange(n), best]


@dataclass
class _LookupEntry:
    median_log_rate: float
    sigma: float
    n: int


class RateLookup:
    """Hierarchical robust median of log rates: (category, unit) -> unit -> global.

    This is the cold-start and out-of-distribution path. It is crude, but it
    degrades predictably, which matters more than accuracy when an item is
    genuinely novel.
    """

    def __init__(self, min_samples: int = 3, default_sigma: float = 0.45) -> None:
        self.min_samples = min_samples
        self.default_sigma = default_sigma
        self.by_category_unit: dict[tuple[str, str], _LookupEntry] = {}
        self.by_category: dict[str, _LookupEntry] = {}
        self.by_unit: dict[str, _LookupEntry] = {}
        self.global_: _LookupEntry = _LookupEntry(np.log(100.0), default_sigma, 0)

    def fit(self, frame: pd.DataFrame, log_rate: np.ndarray) -> "RateLookup":
        data = prepare_frame(frame).assign(_y=np.asarray(log_rate, dtype=float))
        self.global_ = self._entry(data["_y"].to_numpy())
        for (category, unit), group in data.groupby(["category", "unit"], sort=False):
            if len(group) >= self.min_samples:
                self.by_category_unit[(category, unit)] = self._entry(group["_y"].to_numpy())
        for category, group in data.groupby("category", sort=False):
            if len(group) >= self.min_samples:
                self.by_category[category] = self._entry(group["_y"].to_numpy())
        for unit, group in data.groupby("unit", sort=False):
            if len(group) >= self.min_samples:
                self.by_unit[unit] = self._entry(group["_y"].to_numpy())
        return self

    def _entry(self, values: np.ndarray) -> _LookupEntry:
        values = values[np.isfinite(values)]
        if values.size == 0:
            return _LookupEntry(np.log(100.0), self.default_sigma, 0)
        median = float(np.median(values))
        # 1.4826 * MAD is a robust sigma; floor it so tiny groups stay honest.
        mad = float(np.median(np.abs(values - median)))
        sigma = max(1.4826 * mad, 0.18) if values.size >= 4 else self.default_sigma
        return _LookupEntry(median, float(sigma), int(values.size))

    def lookup(self, category: str, unit: str) -> _LookupEntry:
        entry = self.by_category_unit.get((category, unit))
        if entry is not None:
            return entry
        entry = self.by_category.get(category)
        if entry is not None:
            return entry
        entry = self.by_unit.get(unit)
        if entry is not None:
            return entry
        return self.global_

    def predict(self, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        prepared = prepare_frame(frame)
        entries = [
            self.lookup(row.category, row.unit)
            for row in prepared.itertuples(index=False)
        ]
        return (
            np.array([e.median_log_rate for e in entries], dtype=float),
            np.array([e.sigma for e in entries], dtype=float),
        )


class RateModel:
    """Quantile gradient boosting over ``log(base unit rate)``.

    Working in log space is what makes a single model usable across items that
    span four orders of magnitude (€2/m² of seeding to €40k for a substation
    plinth): errors become multiplicative, which is how tender pricing actually
    behaves, and it keeps predictions positive.
    """

    QUANTILES = (0.10, 0.50, 0.90)

    def __init__(
        self,
        svd_components: int = 120,
        learning_rate: float = 0.06,
        max_iter: int = 400,
        max_leaf_nodes: int = 31,
        l2_regularization: float = 1.0,
        novelty_threshold: float = 0.28,
        random_state: int = 0,
    ) -> None:
        self.novelty_threshold = novelty_threshold
        self.random_state = random_state
        self._init_params = dict(
            svd_components=svd_components,
            learning_rate=learning_rate,
            max_iter=max_iter,
            max_leaf_nodes=max_leaf_nodes,
            l2_regularization=l2_regularization,
            novelty_threshold=novelty_threshold,
            random_state=random_state,
        )
        #: Multiplier on every predicted band, fitted out of fold by
        #: :func:`.calibration.calibrate`. 1.0 means "uncalibrated".
        self.sigma_scale_ = 1.0
        self._hgb_kwargs = dict(
            learning_rate=learning_rate,
            max_iter=max_iter,
            max_leaf_nodes=max_leaf_nodes,
            l2_regularization=l2_regularization,
            early_stopping=False,
            random_state=random_state,
        )
        self.features = RateFeatureBuilder(
            svd_components=svd_components, random_state=random_state
        )
        self.models: dict[float, HistGradientBoostingRegressor] = {}
        self.lookup = RateLookup()
        self.neighbours: NearestNeighbors | None = None
        self.n_train_: int = 0
        self.residual_sigma_: float = 0.30

    def clone_unfitted(self) -> "RateModel":
        return RateModel(**self._init_params)

    def fit(self, frame: pd.DataFrame, log_rate: np.ndarray) -> "RateModel":
        target = np.asarray(log_rate, dtype=float)
        mask = np.isfinite(target)
        frame = prepare_frame(frame.loc[mask].reset_index(drop=True))
        target = target[mask]
        self.n_train_ = len(frame)
        if self.n_train_ < 8:
            raise ValueError(
                f"Need at least 8 priced line items to fit a rate model, got {self.n_train_}"
            )

        matrix = self.features.fit_transform(frame)
        self.lookup.fit(frame, target)

        min_leaf = int(np.clip(self.n_train_ // 25, 2, 20))
        for quantile in self.QUANTILES:
            model = HistGradientBoostingRegressor(
                loss="quantile",
                quantile=quantile,
                min_samples_leaf=min_leaf,
                **self._hgb_kwargs,
            )
            model.fit(matrix, target)
            self.models[quantile] = model

        residuals = target - self.models[0.50].predict(matrix)
        # In-sample residuals understate error; the floor keeps bands sane.
        self.residual_sigma_ = float(max(np.std(residuals), 0.12))

        word_matrix = self.features.word_matrix(frame)
        self.neighbours = NearestNeighbors(
            n_neighbors=min(3, self.n_train_), metric="cosine", algorithm="brute"
        ).fit(word_matrix)
        return self

    def similarity(self, frame: pd.DataFrame) -> np.ndarray:
        """Cosine similarity of each item to its nearest training neighbour.

        Low similarity means "we have never priced anything like this" — the
        single most useful signal for deciding what to hand back to a human.
        """
        if self.neighbours is None:
            return np.zeros(len(frame))
        distances, _ = self.neighbours.kneighbors(
            self.features.word_matrix(frame), n_neighbors=1
        )
        return np.clip(1.0 - distances[:, 0], 0.0, 1.0)

    def predict(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Predict base-rate quantiles in log space plus provenance columns."""
        if not self.models:
            raise RuntimeError("RateModel.fit must be called first")
        # Prepared once here; every helper below re-uses it (prepare_frame
        # returns an already-prepared frame unchanged).
        frame = prepare_frame(frame.reset_index(drop=True))
        matrix = self.features.transform(frame)

        quantile_predictions = np.column_stack(
            [self.models[q].predict(matrix) for q in self.QUANTILES]
        )
        # Quantile models are fitted independently and can cross over; sorting
        # each row restores monotonicity without distorting the median much.
        quantile_predictions.sort(axis=1)
        p10, p50, p90 = (quantile_predictions[:, i] for i in range(3))

        similarity = self.similarity(frame)
        lookup_median, lookup_sigma = self.lookup.predict(frame)

        sigma = np.maximum((p90 - p10) / _P10_P90_Z, 0.08)
        sigma = np.maximum(sigma, self.residual_sigma_ * 0.6)

        # Out-of-distribution items fall back to the hierarchical lookup and
        # carry a deliberately wide band.
        novel = similarity < self.novelty_threshold
        method = np.where(novel, "lookup", "model")
        centre = np.where(novel, lookup_median, p50)
        sigma = np.where(novel, np.maximum(lookup_sigma, sigma) * 1.25, sigma)
        # Between the novelty floor and "we've seen this exact item", widen
        # smoothly rather than stepping.
        widen = np.interp(similarity, [self.novelty_threshold, 0.75], [1.45, 1.0])
        sigma = sigma * np.clip(widen, 1.0, 1.6) * self.sigma_scale_

        # A quantity well outside anything seen for this item type is an
        # extrapolation, and trees extrapolate badly. Widen rather than pretend.
        extremity = self.features.quantity_extremity(frame)
        sigma = sigma * np.clip(1.0 + 0.25 * extremity, 1.0, 1.75)

        return pd.DataFrame(
            {
                "log_rate_p50": centre,
                "log_sigma": sigma,
                "log_rate_p10": centre - 1.2816 * sigma,
                "log_rate_p90": centre + 1.2816 * sigma,
                "similarity": similarity,
                "method": method,
                "quantity_extremity": extremity,
            }
        )


class ParametricTotalModel:
    """Top-down project-value model used as an independent cross-check.

    Features are the handful of drivers you know before any take-off exists:
    project type, scale of the principal quantities and how many items the
    scope contains. Trained on the same history, so it is a genuine second
    opinion rather than a re-run of the same arithmetic.
    """

    QUANTILES = (0.10, 0.50, 0.90)
    UNIT_FAMILIES = ("m", "m2", "m3", "nr", "t", "item", "week")

    def __init__(self, random_state: int = 0, min_projects: int = 10) -> None:
        self.random_state = random_state
        self.min_projects = min_projects
        self.encoder: OrdinalEncoder | None = None
        self.models: dict[float, HistGradientBoostingRegressor] = {}
        self.fitted_ = False
        self.n_projects_ = 0

    def project_features(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Aggregate a line-item frame to one row per project."""
        prepared = prepare_frame(frame)
        rows = []
        for project_id, group in prepared.groupby("project_id", sort=False):
            row: dict[str, object] = {
                "project_id": project_id,
                "project_type": group["project_type"].iat[0],
                "n_items": float(len(group)),
                "log_n_items": float(np.log1p(len(group))),
            }
            for unit in self.UNIT_FAMILIES:
                quantity = group.loc[group["unit"] == unit, "quantity"].sum()
                row[f"q_{unit}"] = float(np.log1p(max(quantity, 0.0)))
            row["n_categories"] = float(group["category"].nunique())
            rows.append(row)
        return pd.DataFrame(rows)

    def _matrix(self, projects: pd.DataFrame) -> np.ndarray:
        numeric_columns = [c for c in projects.columns if c.startswith("q_")] + [
            "log_n_items",
            "n_categories",
        ]
        encoded = self.encoder.transform(projects[["project_type"]]).astype(float)
        return np.hstack([projects[numeric_columns].to_numpy(dtype=float), encoded])

    def fit(self, frame: pd.DataFrame, project_totals: pd.Series) -> "ParametricTotalModel":
        projects = self.project_features(frame)
        totals = projects["project_id"].map(project_totals).astype(float)
        keep = totals.notna() & (totals > 0)
        projects, totals = projects.loc[keep], totals.loc[keep]
        self.n_projects_ = len(projects)
        if self.n_projects_ < self.min_projects:
            self.fitted_ = False
            return self

        self.encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
        self.encoder.fit(projects[["project_type"]])
        matrix = self._matrix(projects)
        target = np.log(totals.to_numpy(dtype=float))
        min_leaf = int(np.clip(self.n_projects_ // 8, 2, 10))
        for quantile in self.QUANTILES:
            model = HistGradientBoostingRegressor(
                loss="quantile",
                quantile=quantile,
                learning_rate=0.08,
                max_iter=250,
                max_leaf_nodes=8,
                min_samples_leaf=min_leaf,
                early_stopping=False,
                random_state=self.random_state,
            )
            model.fit(matrix, target)
            self.models[quantile] = model
        self.fitted_ = True
        return self

    def predict(self, frame: pd.DataFrame) -> dict[str, float] | None:
        """Return P10/P50/P90 base-date project value, or ``None`` if unfitted."""
        if not self.fitted_:
            return None
        projects = self.project_features(frame)
        if projects.empty:
            return None
        matrix = self._matrix(projects)
        predictions = np.column_stack([self.models[q].predict(matrix) for q in self.QUANTILES])
        predictions.sort(axis=1)
        values = np.exp(predictions[0])
        return {"p10": float(values[0]), "p50": float(values[1]), "p90": float(values[2])}
