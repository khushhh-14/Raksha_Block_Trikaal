"""Train and explain the RAKSHA-BLOCK defect-priority classification model."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import lightgbm as lgb
import pandas as pd
import shap
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT_DIR / "data" / "synthetic" / "defects.csv"
MODEL_DIR = ROOT_DIR / "models"
MODEL_PATH = MODEL_DIR / "defect_priority_lgb.pkl"
IMPORTANCE_PATH = MODEL_DIR / "feature_importance.json"
METRICS_PATH = MODEL_DIR / "model_metrics.json"

TARGET = "failed_within_90d"
NUMERICAL_FEATURES = [
    "severity",
    "days_overdue",
    "asset_age_years",
    "past_failure_count",
    "deferred_count",
]
CATEGORICAL_FEATURES = ["department", "section"]
FEATURES = NUMERICAL_FEATURES + CATEGORICAL_FEATURES


def load_training_data() -> tuple[pd.DataFrame, pd.Series]:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Training data not found: {DATA_PATH}")

    frame = pd.read_csv(DATA_PATH)
    required_columns = FEATURES + [TARGET]
    missing = [column for column in required_columns if column not in frame.columns]
    if missing:
        raise ValueError(f"Training data is missing required columns: {', '.join(missing)}")

    selected = frame[required_columns].copy()
    if selected.isna().any().any():
        missing_columns = selected.columns[selected.isna().any()].tolist()
        raise ValueError(f"Training data contains missing values in: {', '.join(missing_columns)}")

    for column in NUMERICAL_FEATURES + [TARGET]:
        selected[column] = pd.to_numeric(selected[column], errors="raise")
    for column in CATEGORICAL_FEATURES:
        selected[column] = selected[column].astype("category")

    features = selected[FEATURES]
    target = selected[TARGET].astype(int)
    if not target.isin([0, 1]).all():
        raise ValueError("Target failed_within_90d must contain only 0 or 1")
    return features, target


def build_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", "passthrough", NUMERICAL_FEATURES),
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_FEATURES,
            ),
        ],
        verbose_feature_names_out=False,
    )
    model = lgb.LGBMClassifier(
        n_estimators=150,
        learning_rate=0.05,
        max_depth=6,
        random_state=42,
        verbosity=-1,
    )
    return Pipeline([("preprocessor", preprocessor), ("model", model)])


def save_shap_importance(pipeline: Pipeline, test_features: pd.DataFrame) -> None:
    preprocessor = pipeline.named_steps["preprocessor"]
    model = pipeline.named_steps["model"]
    transformed = preprocessor.transform(test_features)
    feature_names = list(preprocessor.get_feature_names_out())
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(transformed)
    if isinstance(shap_values, list):
        shap_values = shap_values[0]

    mean_abs_values = abs(shap_values).mean(axis=0)
    importance = [
        {"feature": name, "mean_abs_shap_value": round(float(value), 6)}
        for name, value in zip(feature_names, mean_abs_values)
    ]
    importance.sort(key=lambda item: item["mean_abs_shap_value"], reverse=True)
    IMPORTANCE_PATH.write_text(
        json.dumps(
            {
                    "target": TARGET,
                "sample_rows": len(test_features),
                "feature_importance": importance,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> int:
    try:
        features, target = load_training_data()
        train_features, test_features, train_target, test_target = train_test_split(
            features,
            target,
            test_size=0.2,
            random_state=42,
            stratify=target,
        )
        pipeline = build_pipeline()
        pipeline.fit(train_features, train_target)

        probabilities = pipeline.predict_proba(test_features)[:, 1]
        predictions = (probabilities >= 0.5).astype(int)
        metrics = {
            "roc_auc": round(float(roc_auc_score(test_target, probabilities)), 6),
            "precision": round(float(precision_score(test_target, predictions, zero_division=0)), 6),
            "recall": round(float(recall_score(test_target, predictions, zero_division=0)), 6),
            "f1": round(float(f1_score(test_target, predictions, zero_division=0)), 6),
            "brier_score": round(float(brier_score_loss(test_target, probabilities)), 6),
        }
        logistic = Pipeline([("preprocessor", build_pipeline().named_steps["preprocessor"]), ("model", LogisticRegression(max_iter=1000, random_state=42))])
        logistic.fit(train_features, train_target)
        logistic_probabilities = logistic.predict_proba(test_features)[:, 1]
        base_rate = float(train_target.mean())
        baseline_metrics = {
            "logistic_regression_roc_auc": round(float(roc_auc_score(test_target, logistic_probabilities)), 6),
            "majority_base_rate_roc_auc": 0.5,
            "majority_base_rate_brier_score": round(float(brier_score_loss(test_target, [base_rate] * len(test_target))), 6),
            "realised_base_rate": round(float(target.mean()), 6),
            "always_positive_f1": round(float(f1_score(test_target, [1] * len(test_target), zero_division=0)), 6),
        }
        cv_scores = cross_val_score(pipeline, features, target, cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42), scoring="roc_auc")
        metrics.update({"cross_validation_roc_auc_mean": round(float(cv_scores.mean()), 6), "cross_validation_roc_auc_std": round(float(cv_scores.std()), 6)})
        metrics.update(baseline_metrics)
        metrics["lightgbm_beats_logistic"] = metrics["roc_auc"] > baseline_metrics["logistic_regression_roc_auc"]
        metrics["lightgbm_beats_majority"] = metrics["roc_auc"] > baseline_metrics["majority_base_rate_roc_auc"]
        metrics["roc_auc_margin_over_logistic"] = round(metrics["roc_auc"] - baseline_metrics["logistic_regression_roc_auc"], 6)
        metrics["roc_auc_margin_over_majority"] = round(metrics["roc_auc"] - baseline_metrics["majority_base_rate_roc_auc"], 6)

        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(pipeline, MODEL_PATH)
        save_shap_importance(pipeline, test_features)
        METRICS_PATH.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")

        print("RAKSHA-BLOCK defect-priority model training complete")
        print(f"Training rows: {len(train_features)} | Test rows: {len(test_features)}")
        print(f"ROC-AUC: {metrics['roc_auc']:.4f} | Precision: {metrics['precision']:.4f} | Recall: {metrics['recall']:.4f} | F1: {metrics['f1']:.4f} | Brier: {metrics['brier_score']:.4f}")
        print(f"5-fold ROC-AUC: {metrics['cross_validation_roc_auc_mean']:.4f} +/- {metrics['cross_validation_roc_auc_std']:.4f}")
        print(f"LogisticRegression ROC-AUC: {baseline_metrics['logistic_regression_roc_auc']:.4f} (LightGBM margin: {metrics['roc_auc_margin_over_logistic']:.4f})")
        print(f"Majority/base-rate ROC-AUC: {baseline_metrics['majority_base_rate_roc_auc']:.4f} (LightGBM margin: {metrics['roc_auc_margin_over_majority']:.4f})")
        print(f"Realised positive base rate: {baseline_metrics['realised_base_rate']:.4f}")
        print(f"Always-positive F1: {baseline_metrics['always_positive_f1']:.4f}")
        print(f"Model artifact: {MODEL_PATH.relative_to(ROOT_DIR)}")
        print(f"SHAP artifact:  {IMPORTANCE_PATH.relative_to(ROOT_DIR)}")
        print(f"Metrics artifact: {METRICS_PATH.relative_to(ROOT_DIR)}")
        return 0
    except Exception as exc:
        print(f"ERROR: Model training failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())