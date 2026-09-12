"""Glue 4.0 happy-path ETL for the daily ranking training dataset.

The pure functions in this module are intentionally stdlib-only so the
attribution contract can be tested locally without AWS or a Spark runtime.
The ``main`` entry point is the Glue adapter and writes the canonical Parquet
dataset plus the single UTF-8 CSV handoff.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import hashlib
import math
import re
import unicodedata
from datetime import date, datetime, time, timedelta, timezone
from pathlib import PurePosixPath
from typing import Any, Callable, Iterable, Mapping, Sequence
from zoneinfo import ZoneInfo

SCHEMA_VERSION = 1
DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh"
DEFAULT_ATTRIBUTION_WINDOW_MINUTES = 30
TRAINING_COLUMNS = (
    "impressionId",
    "occurredAt",
    "sessionPseudonym",
    "buyerPseudonym",
    "shopId",
    "productId",
    "surface",
    "placement",
    "position",
    "requestId",
    "recommendationId",
    "projectionVersion",
    "profileVersion",
    "modelVersion",
    "scriptVersion",
    "labelClicked",
    "sourceDate",
    "runDate",
)
TRAINING_INTEGER_COLUMNS = {"position", "labelClicked"}

SNAPSHOT_DATASET_VERSION = "personal-ranking-v1"
SNAPSHOT_RANDOM_SEED = 20260902
SNAPSHOT_MODEL_VERSION = 1
SNAPSHOT_PRODUCT_PROJECTION_VERSION = 2
SNAPSHOT_FEATURE_SCHEMA_VERSION = 1
MINIMUM_ELIGIBILITY_SCORE = 5
OFFLINE_LEXICAL_VERSION = "offline_lexical_v1"
BUYER_PAIR_FEATURE_NAMES = (
    "category_affinity", "shop_affinity", "view_count_30d", "favorite_flag",
    "followed_shop_flag", "order_count_90d", "preferred_price_distance",
    "price_band_match", "rating_average_basis_points", "rating_confidence",
    "sold_count_log1p", "promotion_active", "freshness_score", "text_relevance",
    "inventory_available", "profile_score",
)
ENRICHED_TRAINING_COLUMNS = (
    "example_id", "dataset_version", "random_seed", "model_version", "feature_schema_version",
    "split", "fold", "user_id", "product_id", "category_id", "shop_id", "impression_at",
    "label", "label_source", *BUYER_PAIR_FEATURE_NAMES, "sample_weight",
    "source_date", "run_date", "product_snapshot_at", "buyer_snapshot_at",
    "buyer_profile_generated_at", "product_snapshot_run_id", "buyer_snapshot_run_id", "pseudonym_key_id",
    "offline_lexical_version",
)


def training_schema_spec() -> tuple[tuple[str, str], ...]:
    """Return the stable Spark field names/types used for every run."""

    return tuple((column, "int" if column in TRAINING_INTEGER_COLUMNS else "string") for column in TRAINING_COLUMNS)


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("occurredAt must contain a UTC offset")
    return parsed.astimezone(timezone.utc)


def resolve_source_date(value: str, scheduled_at: str | None = None, time_zone: str = DEFAULT_TIME_ZONE) -> str:
    """Resolve the scheduler sentinel or a supplied local date.

    EventBridge Scheduler passes ``previous-local-day`` for the daily run;
    operators can pass an ISO date (or a scheduled timestamp) for a manual
    rerun without changing the transformation code.
    """

    if value != "previous-local-day":
        if len(value) == 10:
            date.fromisoformat(value)
            return value
        return (parse_utc(value).astimezone(ZoneInfo(time_zone)).date() - timedelta(days=1)).isoformat()
    reference = parse_utc(scheduled_at) if scheduled_at else datetime.now(timezone.utc)
    return (reference.astimezone(ZoneInfo(time_zone)).date() - timedelta(days=1)).isoformat()


def local_day_utc_bounds(source_date: str, time_zone: str = DEFAULT_TIME_ZONE) -> tuple[datetime, datetime]:
    local_zone = ZoneInfo(time_zone)
    local_start = datetime.combine(date.fromisoformat(source_date), time.min, tzinfo=local_zone)
    local_end = local_start + timedelta(days=1)
    return local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


def overlapping_raw_partitions(source_date: str, time_zone: str = DEFAULT_TIME_ZONE, attribution_window_minutes: int = DEFAULT_ATTRIBUTION_WINDOW_MINUTES) -> list[tuple[str, str]]:
    """Return UTC ``dt/hour`` partitions for the source day and click window."""

    start, end = local_day_utc_bounds(source_date, time_zone)
    end += timedelta(minutes=attribution_window_minutes)
    cursor = start.replace(minute=0, second=0, microsecond=0)
    partitions: list[tuple[str, str]] = []
    while cursor < end:
        partitions.append((cursor.date().isoformat(), f"{cursor.hour:02d}"))
        cursor += timedelta(hours=1)
    return partitions


def raw_partition_keys(bucket: str, source_date: str, time_zone: str = DEFAULT_TIME_ZONE, attribution_window_minutes: int = DEFAULT_ATTRIBUTION_WINDOW_MINUTES) -> list[str]:
    return [
        str(PurePosixPath("raw", f"schema_version={SCHEMA_VERSION}", f"dt={dt}", f"hour={hour}"))
        for dt, hour in overlapping_raw_partitions(source_date, time_zone, attribution_window_minutes)
    ]


def filter_events(events: Iterable[Mapping[str, Any]], source_date: str, time_zone: str = DEFAULT_TIME_ZONE, attribution_window_minutes: int = DEFAULT_ATTRIBUTION_WINDOW_MINUTES) -> list[dict[str, Any]]:
    start, end = local_day_utc_bounds(source_date, time_zone)
    end += timedelta(minutes=attribution_window_minutes)
    selected: list[dict[str, Any]] = []
    for event in events:
        try:
            occurred = parse_utc(str(event["occurredAt"]))
        except (KeyError, TypeError, ValueError):
            continue
        if start <= occurred < end and event.get("schemaVersion") == SCHEMA_VERSION:
            selected.append(dict(event))
    return selected


def _same_identity(impression: Mapping[str, Any], click: Mapping[str, Any]) -> bool:
    session_matches = bool(impression.get("sessionPseudonym") and click.get("sessionPseudonym") and impression.get("sessionPseudonym") == click.get("sessionPseudonym"))
    buyer_matches = bool(impression.get("buyerPseudonym") and click.get("buyerPseudonym") and impression.get("buyerPseudonym") == click.get("buyerPseudonym"))
    return session_matches or buyer_matches


def _same_context(impression: Mapping[str, Any], click: Mapping[str, Any]) -> bool:
    request_present = bool(impression.get("requestId") or click.get("requestId"))
    recommendation_present = bool(impression.get("recommendationId") or click.get("recommendationId"))
    request_matches = request_present and impression.get("requestId") == click.get("requestId")
    recommendation_matches = recommendation_present and impression.get("recommendationId") == click.get("recommendationId")
    return bool(request_matches or recommendation_matches)


def _matches(impression: Mapping[str, Any], click: Mapping[str, Any], window: timedelta) -> bool:
    if click.get("eventType") != "product_clicked" or click.get("productId") != impression.get("productId") or click.get("shopId") != impression.get("shopId"):
        return False
    if not _same_identity(impression, click) or not _same_context(impression, click):
        return False
    try:
        delta = parse_utc(str(click["occurredAt"])) - parse_utc(str(impression["occurredAt"]))
    except (KeyError, TypeError, ValueError):
        return False
    return timedelta(0) <= delta <= window


def _click_candidate_index(clicks: Sequence[Mapping[str, Any]]) -> dict[tuple[str, str, str, str, str, str], list[Mapping[str, Any]]]:
    index: dict[tuple[str, str, str, str, str, str], list[Mapping[str, Any]]] = {}
    for click in clicks:
        product = str(click.get("productId") or "")
        shop = str(click.get("shopId") or "")
        if not product or not shop:
            continue
        for identity_name in ("sessionPseudonym", "buyerPseudonym"):
            identity = str(click.get(identity_name) or "")
            if not identity:
                continue
            for context_name in ("requestId", "recommendationId"):
                context = str(click.get(context_name) or "")
                if not context:
                    continue
                key = (product, shop, identity_name, identity, context_name, context)
                index.setdefault(key, []).append(click)
    return index


def _click_candidates(
    impression: Mapping[str, Any],
    index: Mapping[tuple[str, str, str, str, str, str], Sequence[Mapping[str, Any]]],
) -> list[Mapping[str, Any]]:
    product = str(impression.get("productId") or "")
    shop = str(impression.get("shopId") or "")
    candidates: dict[str, Mapping[str, Any]] = {}
    for identity_name in ("sessionPseudonym", "buyerPseudonym"):
        identity = str(impression.get(identity_name) or "")
        if not identity:
            continue
        for context_name in ("requestId", "recommendationId"):
            context = str(impression.get(context_name) or "")
            if not context:
                continue
            for click in index.get((product, shop, identity_name, identity, context_name, context), ()):
                candidates[str(click.get("eventId") or id(click))] = click
    return list(candidates.values())


def build_training_rows(events: Sequence[Mapping[str, Any]], source_date: str, run_date: str, attribution_window_minutes: int = DEFAULT_ATTRIBUTION_WINDOW_MINUTES, time_zone: str = DEFAULT_TIME_ZONE, include_query: bool = False) -> list[dict[str, Any]]:
    """Build one labelled row for each valid product impression."""

    window = timedelta(minutes=attribution_window_minutes)
    scoped = filter_events(events, source_date, time_zone, attribution_window_minutes)
    source_start, source_end = local_day_utc_bounds(source_date, time_zone)
    clicks = [event for event in scoped if event.get("eventType") == "product_clicked"]
    click_index = _click_candidate_index(clicks)
    rows: list[dict[str, Any]] = []
    for impression in scoped:
        if impression.get("eventType") != "product_impression":
            continue
        try:
            impression_time = parse_utc(str(impression["occurredAt"]))
        except (KeyError, TypeError, ValueError):
            continue
        if not source_start <= impression_time < source_end:
            continue
        clicked = any(_matches(impression, click, window) for click in _click_candidates(impression, click_index))
        row = {
            "impressionId": impression.get("eventId"),
            "occurredAt": impression.get("occurredAt"),
            "sessionPseudonym": impression.get("sessionPseudonym"),
            "buyerPseudonym": impression.get("buyerPseudonym"),
            "shopId": impression.get("shopId"),
            "productId": impression.get("productId"),
            "surface": impression.get("surface"),
            "placement": impression.get("placement"),
            "position": impression.get("position"),
            "requestId": impression.get("requestId"),
            "recommendationId": impression.get("recommendationId"),
            "projectionVersion": impression.get("projectionVersion"),
            "profileVersion": impression.get("profileVersion"),
            "modelVersion": impression.get("modelVersion"),
            "scriptVersion": impression.get("scriptVersion"),
            "labelClicked": 1 if clicked else 0,
            "sourceDate": source_date,
            "runDate": run_date,
        }
        # Keep the original public legacy row shape unchanged. The enriched
        # path opts into this private value for deterministic offline lexical
        # relevance without changing the legacy CSV contract.
        if include_query:
            row["_query"] = impression.get("query")
            row["_pseudonymKeyId"] = impression.get("pseudonymKeyId")
        rows.append(row)
    return rows


def bounded(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    if not math.isfinite(value):
        return 0.0
    return max(minimum, min(maximum, value))


def offline_lexical_v1(query: str | None, searchable_text: str | None) -> float:
    """Deterministic token overlap used as the offline text approximation."""

    def normalize(value: str | None) -> str:
        decomposed = unicodedata.normalize("NFD", (value or "").replace("đ", "d").replace("Đ", "D"))
        return "".join(character for character in decomposed if unicodedata.category(character) != "Mn").lower()

    query_tokens = set(re.findall(r"\w+", normalize(query)))
    text_tokens = set(re.findall(r"\w+", normalize(searchable_text)))
    return len(query_tokens & text_tokens) / len(query_tokens) if query_tokens else 0.0


def _affinity(values: Sequence[Mapping[str, Any]], value: str) -> float:
    return bounded(sum(float(item.get("weight", 0) or 0) for item in values if item.get("id") == value) / 100.0)


def _snapshot_time(row: Mapping[str, Any]) -> datetime:
    return parse_utc(str(row.get("snapshotAt")))


def _as_of_snapshot(
    rows: Sequence[Mapping[str, Any]],
    key_name: str,
    key: str,
    occurred_at: datetime,
    compatibility: Callable[[Mapping[str, Any]], bool],
) -> Mapping[str, Any] | None:
    candidates = [
        row for row in rows
        if str(row.get(key_name, "")) == key and compatibility(row) and _snapshot_time(row) <= occurred_at
    ]
    return max(candidates, key=lambda row: (_snapshot_time(row), str(row.get("runId", ""))), default=None)


def as_of_snapshot(
    rows: Sequence[Mapping[str, Any]],
    key_name: str,
    key: str,
    occurred_at: datetime,
    compatibility: Callable[[Mapping[str, Any]], bool] = lambda _row: True,
) -> Mapping[str, Any] | None:
    """Select the latest compatible snapshot not newer than an impression."""
    return _as_of_snapshot(rows, key_name, key, occurred_at, compatibility)


def _feature_vector(
    profile: Mapping[str, Any],
    product: Mapping[str, Any],
    query: str | None,
    impression_at: datetime,
) -> dict[str, float]:
    mean_price = profile.get("preferredPriceMeanMinor")
    price = max(0.0, float(product.get("effectivePriceMinor") or 0))
    price_distance = 0.0 if not mean_price else abs(price - float(mean_price)) / max(1.0, float(mean_price))
    minimum = profile.get("preferredPriceMinMinor")
    maximum = profile.get("preferredPriceMaxMinor")
    created = parse_utc(str(product.get("productCreatedAt")))
    age_days = max(0.0, (impression_at - created).total_seconds() / 86_400)
    lexical = bounded(offline_lexical_v1(query, str(product.get("searchableText") or "")))
    return {
        "category_affinity": _affinity(profile.get("categoryAffinities") or [], str(product.get("categoryId"))),
        "shop_affinity": _affinity(profile.get("shopAffinities") or [], str(product.get("shopId"))),
        "view_count_30d": bounded(float(profile.get("viewCount30d") or 0) / 500.0),
        # favorite_flag intentionally follows the current serving contract:
        # favorite count/500 despite the historical feature name.
        "favorite_flag": bounded(float(profile.get("favoriteCount90d") or 0) / 500.0),
        "followed_shop_flag": bounded(float(profile.get("followedShopCount") or 0) / 100.0),
        "order_count_90d": bounded(float(profile.get("orderCount90d") or 0) / 100.0),
        "preferred_price_distance": bounded(1.0 - price_distance),
        "price_band_match": 0.0 if not mean_price else (1.0 if minimum is not None and maximum is not None and float(minimum) <= price <= float(maximum) else 0.0),
        "rating_average_basis_points": bounded(float(product.get("ratingAverageBasisPoints") or 0) / 500.0),
        "rating_confidence": bounded(float(product.get("ratingCount") or 0) / 1000.0),
        "sold_count_log1p": bounded(math.log1p(max(0.0, float(product.get("soldCount") or 0))) / 12.0),
        "promotion_active": 1.0 if product.get("promotionActive") else 0.0,
        "freshness_score": math.exp(-age_days / 30.0),
        "text_relevance": bounded(lexical / (1.0 + abs(lexical))),
        "inventory_available": 1.0 if float(product.get("inventoryAvailable") or 0) > 0 else 0.0,
        "profile_score": bounded(float(profile.get("eligibilityScore") or 0) / 100.0),
    }


def feature_vector(
    profile: Mapping[str, Any],
    product: Mapping[str, Any],
    query: str | None,
    impression_at: datetime,
) -> dict[str, float]:
    """Public pure feature contract used by local tests and Glue smoke checks."""
    return _feature_vector(profile, product, query, impression_at)


def deterministic_snapshot_example_id(impression_id: str, buyer_pseudonym: str, product_id: str) -> str:
    payload = "|".join((SNAPSHOT_DATASET_VERSION, impression_id, buyer_pseudonym, product_id)).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _snapshot_split(example_id: str) -> tuple[str, int]:
    digest = hashlib.sha256(f"{SNAPSHOT_RANDOM_SEED}:{example_id}".encode("utf-8")).digest()
    number = int.from_bytes(digest[:4], "big")
    return ("heldout" if number % 5 == 0 else "train", number % 5)


def enrich_training_rows(
    rows: Sequence[Mapping[str, Any]],
    product_snapshots: Sequence[Mapping[str, Any]],
    buyer_snapshots: Sequence[Mapping[str, Any]],
    pseudonym_key_id: str,
    keyed_cutoff: datetime | None = None,
) -> list[dict[str, Any]]:
    """Point-in-time join legacy labels to privacy-safe product/profile rows."""
    if not pseudonym_key_id:
        raise ValueError("snapshot enrichment requires a pseudonym key id")
    products = [
        row for row in product_snapshots
        if row.get("snapshotSchemaVersion") == 1
        and row.get("featureSchemaVersion") == SNAPSHOT_FEATURE_SCHEMA_VERSION
        and row.get("productProjectionVersion") == SNAPSHOT_PRODUCT_PROJECTION_VERSION
    ]
    buyers = [
        row for row in buyer_snapshots
        if row.get("snapshotSchemaVersion") == 1
        and row.get("featureSchemaVersion") == SNAPSHOT_FEATURE_SCHEMA_VERSION
        and row.get("pseudonymKeyId") == pseudonym_key_id
        and row.get("eligible") is True
        and float(row.get("eligibilityScore") or 0) >= MINIMUM_ELIGIBILITY_SCORE
    ]
    product_index: dict[str, Mapping[str, Any]] = {}
    buyer_index: dict[str, Mapping[str, Any]] = {}
    if keyed_cutoff is not None:
        # The daily path supplies only one source-day product manifest and one
        # merged buyer state. Index once so impressions never linearly scan
        # historical snapshot rows.
        for candidate in products:
            if _snapshot_time(candidate) > keyed_cutoff:
                continue
            key = str(candidate.get("productId", ""))
            current = product_index.get(key)
            if current is None or (_snapshot_time(candidate), str(candidate.get("runId", ""))) > (_snapshot_time(current), str(current.get("runId", ""))):
                product_index[key] = candidate
        for candidate in buyers:
            if _snapshot_time(candidate) > keyed_cutoff:
                continue
            key = str(candidate.get("buyerPseudonym", ""))
            current = buyer_index.get(key)
            if current is None or (_snapshot_time(candidate), str(candidate.get("runId", ""))) > (_snapshot_time(current), str(current.get("runId", ""))):
                buyer_index[key] = candidate
    enriched: list[dict[str, Any]] = []
    for row in rows:
        buyer = str(row.get("buyerPseudonym") or "")
        product_id = str(row.get("productId") or "")
        impression_id = str(row.get("impressionId") or "")
        if not buyer or not product_id or not impression_id:
            continue
        try:
            impression_at = parse_utc(str(row.get("occurredAt")))
        except (TypeError, ValueError):
            continue
        product = product_index.get(product_id) if keyed_cutoff is not None else as_of_snapshot(products, "productId", product_id, impression_at)
        profile = buyer_index.get(buyer) if keyed_cutoff is not None else as_of_snapshot(buyers, "buyerPseudonym", buyer, impression_at)
        if not product or not profile or row.get("_pseudonymKeyId") != pseudonym_key_id:
            continue
        features = feature_vector(profile, product, row.get("_query"), impression_at)
        example_id = deterministic_snapshot_example_id(impression_id, buyer, product_id)
        split, fold = _snapshot_split(example_id)
        enriched.append({
            "example_id": example_id,
            "dataset_version": SNAPSHOT_DATASET_VERSION,
            "random_seed": SNAPSHOT_RANDOM_SEED,
            "model_version": SNAPSHOT_MODEL_VERSION,
            "feature_schema_version": SNAPSHOT_FEATURE_SCHEMA_VERSION,
            "split": split,
            "fold": fold,
            "user_id": buyer,
            "product_id": product_id,
            "category_id": product.get("categoryId", ""),
            "shop_id": product.get("shopId", ""),
            "impression_at": row.get("occurredAt"),
            "label": int(row.get("labelClicked", 0) or 0),
            "label_source": "clickstream-attributed",
            **features,
            "sample_weight": 1.0,
            "source_date": row.get("sourceDate", ""),
            "run_date": row.get("runDate", ""),
            "product_snapshot_at": product.get("snapshotAt"),
            "buyer_snapshot_at": profile.get("snapshotAt"),
            "buyer_profile_generated_at": profile.get("profileGeneratedAt"),
            "product_snapshot_run_id": product.get("runId"),
            "buyer_snapshot_run_id": profile.get("runId"),
            "pseudonym_key_id": pseudonym_key_id,
            "offline_lexical_version": OFFLINE_LEXICAL_VERSION,
        })
    if len(enriched) >= 2:
        trains = [row for row in enriched if row["split"] == "train"]
        heldout = [row for row in enriched if row["split"] == "heldout"]
        if not heldout:
            enriched[-1]["split"] = "heldout"
        elif not trains:
            enriched[-1]["split"] = "train"
    return enriched


def merge_buyer_state(
    previous_state: Sequence[Mapping[str, Any]],
    delta: Sequence[Mapping[str, Any]],
    source_date: str,
    cutoff: datetime,
    max_age_days: int = 30,
) -> list[dict[str, Any]]:
    """Overlay today's delta on yesterday's keyed state and prune stale rows."""
    merged: dict[str, dict[str, Any]] = {}
    for row in [*previous_state, *delta]:
        key = str(row.get("buyerPseudonym", ""))
        if key:
            merged[key] = dict(row)
    oldest = cutoff - timedelta(days=max_age_days)
    result: list[dict[str, Any]] = []
    for row in merged.values():
        try:
            generated_at = parse_utc(str(row.get("profileGeneratedAt")))
        except (TypeError, ValueError):
            continue
        if generated_at < oldest:
            continue
        row["sourceDate"] = source_date
        row["snapshotAt"] = cutoff.isoformat().replace("+00:00", "Z")
        result.append(row)
    return sorted(result, key=lambda row: str(row.get("buyerPseudonym", "")))


def _create_once_put(s3_client: Any, bucket: str, key: str, body: bytes, **kwargs: Any) -> None:
    try:
        s3_client.put_object(Bucket=bucket, Key=key, Body=body, IfNoneMatch="*", **kwargs)
    except Exception as error:
        response = getattr(error, "response", {})
        code = str(response.get("ResponseMetadata", {}).get("HTTPStatusCode", ""))
        error_code = str(response.get("Error", {}).get("Code", ""))
        if code not in {"409", "412"} and error_code not in {"ConditionalRequestConflict", "PreconditionFailed", "412"}:
            raise
        existing = s3_client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if existing != body:
            raise RuntimeError(f"create-once object content conflict: {key}") from error


def write_compacted_buyer_state(
    s3_client: Any,
    bucket: str,
    root_prefix: str,
    source_date: str,
    run_id: str,
    snapshot_at: datetime,
    rows: Sequence[Mapping[str, Any]],
    pseudonym_key_id: str,
) -> str:
    """Write one compacted buyer-state part, then its manifest marker."""
    prefix = f"{root_prefix.rstrip('/')}/buyer-state/schema_version=1/source_date={source_date}/run_id={run_id}"
    part_key = f"{prefix}/parts/part-00000.json.gz"
    payload = "".join(f"{json.dumps(dict(row), sort_keys=True)}\n" for row in rows).encode("utf-8")
    compressed = gzip.compress(payload, mtime=0)
    _create_once_put(
        s3_client,
        bucket,
        part_key,
        compressed,
        ContentType="application/x-ndjson",
        ContentEncoding="gzip",
        ServerSideEncryption="AES256",
    )
    digest = hashlib.sha256(compressed).hexdigest()
    manifest_key = f"{prefix}/manifest.json"
    manifest = {
        "manifestVersion": 1,
        "dataset": "buyer-state",
        "runId": run_id,
        "sourceDate": source_date,
        "snapshotAt": snapshot_at.isoformat().replace("+00:00", "Z"),
        "cutoff": snapshot_at.isoformat().replace("+00:00", "Z"),
        "schemaVersion": 1,
        "featureSchemaVersion": SNAPSHOT_FEATURE_SCHEMA_VERSION,
        "pseudonymKeyId": pseudonym_key_id,
        "rowCount": len(rows),
        "parts": [{"key": part_key, "rowCount": len(rows), "byteCount": len(compressed), "sha256": digest}],
        "createdAt": snapshot_at.isoformat().replace("+00:00", "Z"),
    }
    _create_once_put(
        s3_client,
        bucket,
        manifest_key,
        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json",
        ServerSideEncryption="AES256",
    )
    return manifest_key


def serialize_training_csv(rows: Sequence[Mapping[str, Any]], columns: Sequence[str] = TRAINING_COLUMNS) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=list(columns), extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: "" if row.get(column) is None else row.get(column) for column in columns})
    return output.getvalue().encode("utf-8")


def serialize_enriched_training_csv(rows: Sequence[Mapping[str, Any]]) -> bytes:
    return serialize_training_csv(rows, ENRICHED_TRAINING_COLUMNS)


def output_keys(source_date: str, run_date: str) -> tuple[str, str]:
    processed = f"processed/interactions/source_date={source_date}/run_date={run_date}/"
    export = f"exports/training/run_date={run_date}/training.csv"
    return processed, export


def read_raw_json_lines(s3_client: Any, bucket: str, key: str) -> list[dict[str, Any]]:
    response = s3_client.get_object(Bucket=bucket, Key=key)
    body = response["Body"].read()
    if key.endswith(".gz") or response.get("ContentEncoding") == "gzip":
        body = gzip.decompress(body)
    events: list[dict[str, Any]] = []
    for line in body.decode("utf-8").splitlines():
        if line.strip():
            events.append(json.loads(line))
    return events


def write_training_csv(
    s3_client: Any,
    bucket: str,
    key: str,
    rows: Sequence[Mapping[str, Any]],
    columns: Sequence[str] = TRAINING_COLUMNS,
) -> None:
    _create_once_put(
        s3_client,
        bucket,
        key,
        serialize_training_csv(rows, columns),
        ContentType="text/csv; charset=utf-8",
        ServerSideEncryption="AES256",
    )


def training_manifest_key() -> str:
    return "exports/training/latest.json"


def update_training_manifest(
    s3_client: Any,
    bucket: str,
    training_uri: str,
    max_entries: int = 30,
) -> list[str]:
    """Prepend one exact daily URI and retain only the newest thirty."""
    existing: list[str] = []
    try:
        body = s3_client.get_object(Bucket=bucket, Key=training_manifest_key())["Body"].read()
        parsed = json.loads(body)
        existing = parsed.get("uris", []) if isinstance(parsed, dict) else []
    except Exception as error:
        error_code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
        if error_code not in {"NoSuchKey", "404", "NotFound"}:
            raise
    daily_uri_pattern = re.compile(r"^s3://[^/?#]+/exports/training/run_date=(\d{4}-\d{2}-\d{2})/training\.csv$")
    candidates = list(dict.fromkeys([training_uri, *[str(uri) for uri in existing if isinstance(uri, str)]]))
    if any(daily_uri_pattern.fullmatch(uri) is None for uri in candidates):
        raise ValueError("training manifest accepts only exact daily training.csv URIs")
    uris = sorted(candidates, key=lambda uri: (daily_uri_pattern.fullmatch(uri).group(1), uri), reverse=True)[:max_entries]
    body = json.dumps({"manifestVersion": 1, "dataset": "recommendation-training", "uris": uris}, sort_keys=True, separators=(",", ":")).encode("utf-8")
    s3_client.put_object(
        Bucket=bucket,
        Key=training_manifest_key(),
        Body=body,
        ContentType="application/json",
        ServerSideEncryption="AES256",
    )
    return uris


def discover_committed_manifests(
    s3_client: Any,
    bucket: str,
    prefix: str,
    dataset: str,
    source_date: str,
    cutoff: datetime,
) -> list[dict[str, Any]]:
    """Discover one source-date prefix, never the complete snapshot history."""
    manifests: list[dict[str, Any]] = []
    continuation: str | None = None
    while True:
        request: dict[str, Any] = {"Bucket": bucket, "Prefix": f"{prefix.rstrip('/')}/{dataset}/schema_version=1/source_date={source_date}/", "MaxKeys": 1000}
        if continuation:
            request["ContinuationToken"] = continuation
        response = s3_client.list_objects_v2(**request)
        for item in response.get("Contents", []):
            key = str(item.get("Key", ""))
            if not key.endswith("/manifest.json"):
                continue
            manifest = json.loads(s3_client.get_object(Bucket=bucket, Key=key)["Body"].read())
            if manifest.get("dataset") != dataset or manifest.get("sourceDate") != source_date:
                continue
            try:
                snapshot_at = parse_utc(str(manifest["snapshotAt"]))
            except (KeyError, TypeError, ValueError):
                continue
            if snapshot_at <= cutoff:
                manifest["manifestKey"] = key
                manifests.append(manifest)
        if not response.get("IsTruncated"):
            break
        continuation = response.get("NextContinuationToken")
    return sorted(manifests, key=lambda item: (str(item.get("snapshotAt")), str(item.get("runId"))))


def should_use_snapshot_enrichment(
    product_manifests: Sequence[Mapping[str, Any]],
    buyer_manifests: Sequence[Mapping[str, Any]],
) -> bool:
    """Committed manifests select the enriched contract, even when empty."""

    return bool(product_manifests and buyer_manifests)


def read_snapshot_rows(s3_client: Any, bucket: str, manifests: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for manifest in manifests:
        for part in manifest.get("parts", []):
            key = str(part.get("key", ""))
            if not key.endswith(".json.gz"):
                continue
            response = s3_client.get_object(Bucket=bucket, Key=key)
            body = response["Body"].read()
            rows.extend(json.loads(line) for line in gzip.decompress(body).decode("utf-8").splitlines() if line.strip())
    return rows


def parse_job_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--SOURCE_DATE", dest="source_date", default="previous-local-day")
    parser.add_argument("--RUN_DATE", dest="run_date", default=None)
    parser.add_argument("--RUN_ID", dest="run_id", default=None)
    parser.add_argument("--SCHEDULED_AT", dest="scheduled_at", default=None)
    parser.add_argument("--RAW_BUCKET", dest="raw_bucket", required=True)
    parser.add_argument("--PROCESSED_BUCKET", dest="processed_bucket", required=True)
    parser.add_argument("--ATTRIBUTION_WINDOW_MINUTES", dest="attribution_window_minutes", type=int, default=DEFAULT_ATTRIBUTION_WINDOW_MINUTES)
    parser.add_argument("--TIME_ZONE", dest="time_zone", default=DEFAULT_TIME_ZONE)
    args, _ = parser.parse_known_args(argv)
    return args


def _snapshot_part_paths(bucket: str, manifests: Sequence[Mapping[str, Any]]) -> list[str]:
    """Return only committed part keys; the rows stay in Spark storage."""

    return [
        f"s3://{bucket}/{part['key']}"
        for manifest in manifests
        for part in manifest.get("parts", [])
        if isinstance(part, Mapping) and str(part.get("key", "")).endswith(".json.gz")
    ]


def _copy_once_from_staging(s3_client: Any, bucket: str, source_key: str, target_key: str, content_type: str) -> None:
    """Publish a Spark part without reading it through the Glue driver."""

    try:
        s3_client.head_object(Bucket=bucket, Key=target_key)
        return
    except Exception as error:
        code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
        if code not in {"404", "NoSuchKey", "NotFound"}:
            raise
    s3_client.copy_object(
        Bucket=bucket,
        Key=target_key,
        CopySource={"Bucket": bucket, "Key": source_key},
        ContentType=content_type,
        MetadataDirective="REPLACE",
        ChecksumAlgorithm="SHA256",
        ServerSideEncryption="AES256",
    )


def _head_checksum_hex(s3_client: Any, bucket: str, key: str) -> str | None:
    try:
        head = s3_client.head_object(Bucket=bucket, Key=key, ChecksumMode="ENABLED")
    except TypeError:
        head = s3_client.head_object(Bucket=bucket, Key=key)
    checksum = head.get("ChecksumSHA256")
    if not checksum:
        return None
    import base64
    return base64.b64decode(str(checksum)).hex()


def _publish_spark_single_file(s3_client: Any, bucket: str, staging_prefix: str, target_key: str, suffix: str, content_type: str) -> None:
    """Copy one distributed Spark output part to the exact handoff key.

    ``coalesce(1)`` is deliberately limited to the final CSV adapter and the
    compacted-state marker. Spark does the read, joins, feature computation,
    and Parquet write distributed; no daily rows are collected by the driver.
    """

    response = s3_client.list_objects_v2(Bucket=bucket, Prefix=staging_prefix)
    parts = sorted(
        str(item["Key"])
        for item in response.get("Contents", [])
        if str(item.get("Key", "")).endswith(suffix)
    )
    if len(parts) != 1:
        raise RuntimeError(f"Expected exactly one Spark output part under {staging_prefix}")
    _copy_once_from_staging(s3_client, bucket, parts[0], target_key, content_type)


def _spark_raw_schema() -> Any:
    from pyspark.sql.types import IntegerType, StringType, StructField, StructType  # type: ignore

    return StructType([
        StructField("eventId", StringType(), True),
        StructField("schemaVersion", IntegerType(), True),
        StructField("eventType", StringType(), True),
        StructField("occurredAt", StringType(), True),
        StructField("sessionPseudonym", StringType(), True),
        StructField("buyerPseudonym", StringType(), True),
        StructField("pseudonymKeyId", StringType(), True),
        StructField("shopId", StringType(), True),
        StructField("productId", StringType(), True),
        StructField("surface", StringType(), True),
        StructField("placement", StringType(), True),
        StructField("position", IntegerType(), True),
        StructField("requestId", StringType(), True),
        StructField("recommendationId", StringType(), True),
        StructField("projectionVersion", StringType(), True),
        StructField("profileVersion", StringType(), True),
        StructField("modelVersion", StringType(), True),
        StructField("scriptVersion", StringType(), True),
        StructField("query", StringType(), True),
    ])


def _spark_enriched_frame(impressions: Any, products: Any, buyers: Any, source_date: str, run_date: str, pseudonym_key_id: str) -> Any:
    """Build the normalized sixteen-feature training frame in Spark."""

    from pyspark.sql import functions as F  # type: ignore

    product = products.select(*[F.col(name).alias(f"p_{name}") for name in products.columns])
    buyer = buyers.select(*[F.col(name).alias(f"b_{name}") for name in buyers.columns])
    joined = impressions.alias("i").join(
        product.alias("p"),
        (F.col("i_productId") == F.col("p_productId"))
        & (F.col("i_impressionAt") >= F.col("p_snapshotAt"))
        & (F.col("p_snapshotAt") <= F.col("i_impressionAt")),
        "inner",
    ).join(
        buyer.alias("b"),
        (F.col("i_buyerPseudonym") == F.col("b_buyerPseudonym"))
        & (F.col("i_pseudonymKeyId") == F.lit(pseudonym_key_id))
        & (F.col("b_pseudonymKeyId") == F.lit(pseudonym_key_id))
        & (F.col("b_eligible") == F.lit(True))
        & (F.col("b_eligibilityScore") >= F.lit(MINIMUM_ELIGIBILITY_SCORE))
        & (F.col("i_impressionAt") >= F.col("b_snapshotAt"))
        & (F.col("b_snapshotAt") <= F.col("i_impressionAt"))
        & (F.col("b_profileGeneratedAt") <= F.col("i_impressionAt")),
        "inner",
    )
    category_affinity = F.expr("aggregate(filter(b_categoryAffinities, x -> x.id = p_categoryId), 0D, (acc, x) -> acc + x.weight) / 100D")
    shop_affinity = F.expr("aggregate(filter(b_shopAffinities, x -> x.id = p_shopId), 0D, (acc, x) -> acc + x.weight) / 100D")
    mean_price = F.col("b_preferredPriceMeanMinor").cast("double")
    price = F.col("p_effectivePriceMinor").cast("double")
    price_distance = F.abs(price - mean_price) / F.greatest(F.lit(1.0), mean_price)
    age_days = F.greatest(F.lit(0.0), (F.unix_timestamp("i_impressionAt") - F.unix_timestamp("p_productCreatedAt")) / F.lit(86_400.0))
    lexical = F.udf(offline_lexical_v1, "double")(F.col("i_query"), F.col("p_searchableText"))
    features = {
        "category_affinity": F.least(F.lit(1.0), F.greatest(F.lit(0.0), category_affinity)),
        "shop_affinity": F.least(F.lit(1.0), F.greatest(F.lit(0.0), shop_affinity)),
        "view_count_30d": F.least(F.lit(1.0), F.greatest(F.lit(0.0), F.col("b_viewCount30d") / 500.0)),
        "favorite_flag": F.least(F.lit(1.0), F.greatest(F.lit(0.0), F.col("b_favoriteCount90d") / 500.0)),
        "followed_shop_flag": F.least(F.lit(1.0), F.greatest(F.lit(0.0), F.col("b_followedShopCount") / 100.0)),
        "order_count_90d": F.least(F.lit(1.0), F.greatest(F.lit(0.0), F.col("b_orderCount90d") / 100.0)),
        "preferred_price_distance": F.when(mean_price.isNull(), 0.0).otherwise(F.least(F.lit(1.0), F.greatest(F.lit(0.0), 1.0 - price_distance))),
        "price_band_match": F.when(mean_price.isNotNull() & F.col("b_preferredPriceMinMinor").isNotNull() & F.col("b_preferredPriceMaxMinor").isNotNull() & (price >= F.col("b_preferredPriceMinMinor")) & (price <= F.col("b_preferredPriceMaxMinor")), 1.0).otherwise(0.0),
        "rating_average_basis_points": F.least(F.lit(1.0), F.greatest(F.lit(0.0), F.col("p_ratingAverageBasisPoints") / 500.0)),
        "rating_confidence": F.least(F.lit(1.0), F.greatest(F.lit(0.0), F.col("p_ratingCount") / 1000.0)),
        "sold_count_log1p": F.least(F.lit(1.0), F.greatest(F.lit(0.0), F.log1p(F.greatest(F.lit(0.0), F.col("p_soldCount"))) / 12.0)),
        "promotion_active": F.when(F.col("p_promotionActive") == F.lit(True), 1.0).otherwise(0.0),
        "freshness_score": F.exp(-age_days / 30.0),
        "text_relevance": F.least(F.lit(1.0), F.greatest(F.lit(0.0), lexical / (1.0 + F.abs(lexical)))),
        "inventory_available": F.when(F.col("p_inventoryAvailable") > 0, 1.0).otherwise(0.0),
        "profile_score": F.least(F.lit(1.0), F.greatest(F.lit(0.0), F.col("b_eligibilityScore") / 100.0)),
    }
    example_id = F.sha2(F.concat_ws("|", F.lit(SNAPSHOT_DATASET_VERSION), F.col("i_eventId"), F.col("i_buyerPseudonym"), F.col("p_productId")), 256)
    numbered = joined.select(
        example_id.alias("example_id"),
        F.lit(SNAPSHOT_DATASET_VERSION).alias("dataset_version"),
        F.lit(SNAPSHOT_RANDOM_SEED).alias("random_seed"),
        F.lit(SNAPSHOT_MODEL_VERSION).alias("model_version"),
        F.lit(SNAPSHOT_FEATURE_SCHEMA_VERSION).alias("feature_schema_version"),
        F.col("i_buyerPseudonym").alias("user_id"), F.col("p_productId").alias("product_id"),
        F.col("p_categoryId").alias("category_id"), F.col("p_shopId").alias("shop_id"),
        F.col("i_impressionAt").alias("impression_at"), F.col("i_labelClicked").cast("int").alias("label"),
        F.lit("clickstream-attributed").alias("label_source"),
        *[value.alias(name) for name, value in features.items()], F.lit(1.0).alias("sample_weight"),
        F.lit(source_date).alias("source_date"), F.lit(run_date).alias("run_date"),
        F.col("p_snapshotAt").alias("product_snapshot_at"), F.col("b_snapshotAt").alias("buyer_snapshot_at"),
        F.col("b_profileGeneratedAt").alias("buyer_profile_generated_at"), F.col("p_runId").alias("product_snapshot_run_id"),
        F.col("b_runId").alias("buyer_snapshot_run_id"), F.lit(pseudonym_key_id).alias("pseudonym_key_id"),
        F.lit(OFFLINE_LEXICAL_VERSION).alias("offline_lexical_version"),
    )
    return numbered.withColumn("split", F.when(F.pmod(F.xxhash64("example_id"), 5) == 0, F.lit("heldout")).otherwise(F.lit("train"))).withColumn("fold", F.pmod(F.xxhash64("example_id"), 5))


def main() -> None:
    args = parse_job_args()
    source_date = resolve_source_date(args.source_date, args.scheduled_at, args.time_zone)
    run_date = args.run_date if args.run_date and args.run_date != "previous-local-day" else datetime.now(timezone.utc).astimezone(ZoneInfo(args.time_zone)).date().isoformat()
    run_id = args.run_id or f"glue-{source_date}-{run_date}"
    import boto3  # type: ignore
    from pyspark.sql import SparkSession, functions as F  # type: ignore

    s3 = boto3.client("s3")
    spark = SparkSession.builder.getOrCreate()
    source_start, source_end = local_day_utc_bounds(source_date, args.time_zone)
    raw_paths = [
        f"s3://{args.raw_bucket}/{prefix}/*"
        for prefix in raw_partition_keys(args.raw_bucket, source_date, args.time_zone, args.attribution_window_minutes)
    ]
    # Daily objects are immutable. Avoid rereading raw/S3 snapshots if the
    # exact training handoff has already committed (operator reruns remain a
    # cheap manifest refresh).
    try:
        s3.head_object(Bucket=args.processed_bucket, Key=output_keys(source_date, run_date)[1])
        update_training_manifest(s3, args.processed_bucket, f"s3://{args.processed_bucket}/{output_keys(source_date, run_date)[1]}")
        spark.stop()
        return
    except Exception as error:
        code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
        if code not in {"404", "NoSuchKey", "NotFound"}:
            raise
    raw = spark.read.schema(_spark_raw_schema()).json(raw_paths)
    events = raw.where((F.col("schemaVersion") == SCHEMA_VERSION) & F.col("occurredAt").isNotNull()).withColumn("_occurredAt", F.to_timestamp("occurredAt"))
    events = events.where((F.col("_occurredAt") >= F.lit(source_start)) & (F.col("_occurredAt") < F.lit(source_end + timedelta(minutes=args.attribution_window_minutes))))
    impressions = events.where((F.col("eventType") == "product_impression") & (F.col("_occurredAt") >= F.lit(source_start)) & (F.col("_occurredAt") < F.lit(source_end))).select(
        *[F.col(name).alias(f"i_{name}") for name in events.columns if name != "_occurredAt"], F.col("_occurredAt").alias("i_impressionAt"),
    )
    clicks = events.where(F.col("eventType") == "product_clicked").select(*[F.col(name).alias(f"c_{name}") for name in events.columns if name != "_occurredAt"], F.col("_occurredAt").alias("c_occurredAt"))
    identity = (
        (F.col("i_sessionPseudonym").isNotNull() & (F.col("i_sessionPseudonym") == F.col("c_sessionPseudonym")))
        | (F.col("i_buyerPseudonym").isNotNull() & (F.col("i_buyerPseudonym") == F.col("c_buyerPseudonym")))
    )
    context = (
        (F.col("i_requestId").isNotNull() & (F.col("i_requestId") == F.col("c_requestId")))
        | (F.col("i_recommendationId").isNotNull() & (F.col("i_recommendationId") == F.col("c_recommendationId")))
    )
    click_join = (F.col("i_productId") == F.col("c_productId")) & (F.col("i_shopId") == F.col("c_shopId")) & identity & context & (F.col("c_occurredAt") >= F.col("i_impressionAt")) & (F.col("c_occurredAt") <= F.col("i_impressionAt") + F.expr(f"INTERVAL {args.attribution_window_minutes} MINUTES"))
    impression_columns = [column for column in impressions.columns]
    labelled = impressions.join(clicks, click_join, "left").groupBy(*impression_columns).agg(F.max(F.when(F.col("c_eventType") == "product_clicked", 1).otherwise(0)).alias("i_labelClicked"))
    labels = labelled.select(*[F.col(column) for column in impression_columns], F.col("i_labelClicked"))

    # Manifest listing is bounded to one source-date prefix. Only the
    # immediately preceding compacted state is considered for buyer carry-forward.
    product_manifests = [m for m in discover_committed_manifests(s3, args.processed_bucket, "snapshots", "products", source_date, source_start) if m.get("productProjectionVersion") == SNAPSHOT_PRODUCT_PROJECTION_VERSION and m.get("featureSchemaVersion") == SNAPSHOT_FEATURE_SCHEMA_VERSION]
    buyer_manifests = [m for m in discover_committed_manifests(s3, args.processed_bucket, "snapshots", "buyer-profiles", source_date, source_start) if m.get("featureSchemaVersion") == SNAPSHOT_FEATURE_SCHEMA_VERSION and m.get("pseudonymKeyId")]
    previous_date = (date.fromisoformat(source_date) - timedelta(days=1)).isoformat()
    previous_manifests = [m for m in discover_committed_manifests(s3, args.processed_bucket, "snapshots/compacted", "buyer-state", previous_date, source_start) if m.get("featureSchemaVersion") == SNAPSHOT_FEATURE_SCHEMA_VERSION and m.get("pseudonymKeyId")]
    buyer_part_paths = _snapshot_part_paths(args.processed_bucket, buyer_manifests[-1:])
    previous_part_paths = _snapshot_part_paths(args.processed_bucket, previous_manifests[-1:])
    # A committed empty buyer delta is still a snapshot-backed run. Do not
    # silently invent zero-filled legacy features; the inner buyer join must
    # emit an empty/header-only enriched dataset until bootstrap/state exists.
    has_snapshots = should_use_snapshot_enrichment(product_manifests, buyer_manifests)
    processed_prefix, csv_key = output_keys(source_date, run_date)
    staged_root = f"processed/_staging/run_id={run_id}"
    if has_snapshots:
        key_ids = {str(manifest["pseudonymKeyId"]) for manifest in buyer_manifests}
        if len(key_ids) != 1:
            raise RuntimeError("Compatible buyer snapshots use more than one pseudonym key id")
        key_id = next(iter(key_ids))
        product_df = spark.read.json(_snapshot_part_paths(args.processed_bucket, product_manifests[-1:])).where((F.col("snapshotSchemaVersion") == 1) & (F.col("featureSchemaVersion") == SNAPSHOT_FEATURE_SCHEMA_VERSION) & (F.col("productProjectionVersion") == SNAPSHOT_PRODUCT_PROJECTION_VERSION)).withColumn("snapshotAt", F.to_timestamp("snapshotAt"))
        delta_paths = buyer_part_paths
        previous_paths = previous_part_paths
        if previous_paths:
            previous_df = spark.read.json(previous_paths)
            delta_df = spark.read.json(delta_paths) if delta_paths else previous_df.limit(0)
        elif delta_paths:
            delta_df = spark.read.json(delta_paths)
            previous_df = delta_df.limit(0)
        else:
            # A header-only delta is a valid first-day warm-up marker but has
            # no buyer rows to join. Reuse the product schema and let the
            # inner join produce an empty enriched frame.
            delta_df = spark.createDataFrame([], "buyerPseudonym string, profileGeneratedAt timestamp, snapshotAt timestamp, runId string, pseudonymKeyId string, eligible boolean, eligibilityScore double, categoryAffinities array<struct<id:string,weight:double>>, shopAffinities array<struct<id:string,weight:double>>, viewCount30d double, favoriteCount90d double, followedShopCount double, orderCount90d double, preferredPriceMinMinor double, preferredPriceMaxMinor double, preferredPriceMeanMinor double")
            previous_df = delta_df
        merged = previous_df.withColumn("_priority", F.lit(0)).unionByName(delta_df.withColumn("_priority", F.lit(1)), allowMissingColumns=True).withColumn("snapshotAt", F.to_timestamp("snapshotAt"))
        from pyspark.sql.window import Window  # type: ignore
        merged = merged.withColumn("profileGeneratedAt", F.to_timestamp("profileGeneratedAt")).withColumn("_rn", F.row_number().over(Window.partitionBy("buyerPseudonym").orderBy(F.col("_priority").desc(), F.col("snapshotAt").desc(), F.col("runId").desc()))).where(F.col("_rn") == 1).drop("_rn", "_priority")
        merged = merged.where(F.col("profileGeneratedAt") >= F.lit(source_start - timedelta(days=30))).withColumn("sourceDate", F.lit(source_date)).withColumn("snapshotAt", F.lit(source_start))
        merged = merged.cache()
        state_count = merged.count()
        state_stage = f"s3://{args.processed_bucket}/{staged_root}/buyer-state"
        merged.coalesce(1).write.mode("overwrite").json(state_stage, compression="gzip")
        state_prefix = f"{staged_root}/buyer-state/"
        state_key = f"snapshots/compacted/buyer-state/schema_version=1/source_date={source_date}/run_id={run_id}/parts/part-00000.json.gz"
        _publish_spark_single_file(s3, args.processed_bucket, state_prefix, state_key, ".json.gz", "application/x-ndjson")
        # The manifest is the commit marker. Its digest is a stable marker for
        # the server-side copied Spark object; no state bytes enter the driver.
        head = s3.head_object(Bucket=args.processed_bucket, Key=state_key)
        state_manifest_key = f"snapshots/compacted/buyer-state/schema_version=1/source_date={source_date}/run_id={run_id}/manifest.json"
        state_part = {"key": state_key, "rowCount": state_count, "byteCount": int(head.get("ContentLength", 0))}
        checksum = _head_checksum_hex(s3, args.processed_bucket, state_key)
        if checksum:
            state_part["sha256"] = checksum
        state_manifest = {"manifestVersion": 1, "dataset": "buyer-state", "runId": run_id, "sourceDate": source_date, "snapshotAt": source_start.isoformat().replace("+00:00", "Z"), "cutoff": source_start.isoformat().replace("+00:00", "Z"), "schemaVersion": 1, "featureSchemaVersion": SNAPSHOT_FEATURE_SCHEMA_VERSION, "pseudonymKeyId": key_id, "rowCount": state_count, "parts": [state_part], "createdAt": source_start.isoformat().replace("+00:00", "Z")}
        _create_once_put(s3, args.processed_bucket, state_manifest_key, json.dumps(state_manifest, sort_keys=True, separators=(",", ":")).encode(), ContentType="application/json", ServerSideEncryption="AES256")
        buyers_df = merged.withColumn("profileGeneratedAt", F.to_timestamp("profileGeneratedAt"))
        impression_input = labels.select(*[F.col(column).alias(column) for column in labels.columns]).withColumnRenamed("i_eventId", "i_eventId")
        enriched = _spark_enriched_frame(impression_input, product_df, buyers_df, source_date, run_date, key_id)
        output_frame = enriched.select(*ENRICHED_TRAINING_COLUMNS)
    else:
        output_frame = labels.select(
            F.col("i_eventId").alias("impressionId"), F.col("i_impressionAt").alias("occurredAt"), F.col("i_sessionPseudonym").alias("sessionPseudonym"), F.col("i_buyerPseudonym").alias("buyerPseudonym"), F.col("i_shopId").alias("shopId"), F.col("i_productId").alias("productId"), F.col("i_surface").alias("surface"), F.col("i_placement").alias("placement"), F.col("i_position").alias("position"), F.col("i_requestId").alias("requestId"), F.col("i_recommendationId").alias("recommendationId"), F.col("i_projectionVersion").alias("projectionVersion"), F.col("i_profileVersion").alias("profileVersion"), F.col("i_modelVersion").alias("modelVersion"), F.col("i_scriptVersion").alias("scriptVersion"), F.col("i_labelClicked").alias("labelClicked"), F.lit(source_date).alias("sourceDate"), F.lit(run_date).alias("runDate"),
        ).select(*TRAINING_COLUMNS)
    output_frame.write.mode("errorifexists").parquet(f"s3://{args.processed_bucket}/{processed_prefix}")
    csv_stage = f"s3://{args.processed_bucket}/{staged_root}/csv"
    output_frame.coalesce(1).write.mode("overwrite").option("header", "true").csv(csv_stage)
    _publish_spark_single_file(s3, args.processed_bucket, f"{staged_root}/csv/", csv_key, ".csv", "text/csv; charset=utf-8")
    update_training_manifest(s3, args.processed_bucket, f"s3://{args.processed_bucket}/{csv_key}")
    spark.stop()


if __name__ == "__main__":
    main()
