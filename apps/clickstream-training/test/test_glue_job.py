import unittest

from glue_job import (
    BUYER_PAIR_FEATURE_NAMES,
    ENRICHED_TRAINING_COLUMNS,
    TRAINING_COLUMNS,
    as_of_snapshot,
    build_training_rows,
    _click_candidate_index,
    _click_candidates,
    _create_once_put,
    merge_buyer_state,
    enrich_training_rows,
    existing_raw_paths,
    local_day_utc_bounds,
    output_keys,
    overlapping_raw_partitions,
    parse_utc,
    parse_job_args,
    serialize_training_csv,
    serialize_enriched_training_csv,
    should_use_snapshot_enrichment,
    training_schema_spec,
    update_training_manifest,
    write_training_csv,
)


SHOP = "00000000-0000-4000-8000-000000000101"
PRODUCT = "00000000-0000-4000-8000-000000000201"
REQUEST = "00000000-0000-4000-8000-000000000301"


class _ConditionalConflict(Exception):
    response = {"ResponseMetadata": {"HTTPStatusCode": 412}}


class _NotFound(Exception):
    response = {"Error": {"Code": "NoSuchKey"}}


class FakeS3:
    def __init__(self, body=None):
        self.objects = {}
        if body is not None:
            self.objects["exports/training/latest.json"] = body
        self.puts = []

    def put_object(self, **kwargs):
        key = kwargs["Key"]
        if kwargs.get("IfNoneMatch") == "*" and key in self.objects:
            raise _ConditionalConflict()
        self.objects[key] = kwargs["Body"]
        self.puts.append(kwargs)

    def get_object(self, **kwargs):
        return {"Body": _Body(self.objects[kwargs["Key"]])}


class LegacyGlueS3(FakeS3):
    class _ServiceModel:
        @staticmethod
        def operation_model(_name):
            operation = type("Operation", (), {})()
            operation.input_shape = type("InputShape", (), {"members": {}})()
            return operation

    def __init__(self, body=None):
        super().__init__(body)
        self.meta = type("Meta", (), {"service_model": self._ServiceModel()})()

    def put_object(self, **kwargs):
        if "IfNoneMatch" in kwargs:
            raise AssertionError("Glue 4.0 must not receive IfNoneMatch")
        super().put_object(**kwargs)

    def get_object(self, **kwargs):
        if kwargs["Key"] not in self.objects:
            raise _NotFound()
        return super().get_object(**kwargs)


class _Body:
    def __init__(self, value):
        self.value = value

    def read(self):
        return self.value


def event(event_id, event_type, occurred_at, request_id=REQUEST):
    return {
        "eventId": event_id,
        "schemaVersion": 1,
        "eventType": event_type,
        "occurredAt": occurred_at,
        "shopId": SHOP,
        "productId": PRODUCT,
        "surface": "search",
        "sessionPseudonym": "session-hash-01",
        "placement": "search_results",
        "position": 1,
        "requestId": request_id,
    }


class GlueTransformTests(unittest.TestCase):
    def test_local_day_uses_overlapping_utc_partitions(self):
        start, end = local_day_utc_bounds("2026-09-10")
        self.assertEqual(start.isoformat(), "2026-09-09T17:00:00+00:00")
        self.assertEqual(end.isoformat(), "2026-09-10T17:00:00+00:00")
        self.assertEqual(overlapping_raw_partitions("2026-09-10")[0], ("2026-09-09", "17"))

    def test_spark_reads_only_raw_partitions_that_exist(self):
        class PartitionS3:
            def list_objects_v2(self, **kwargs):
                if kwargs["Prefix"].endswith("hour=07/"):
                    return {"KeyCount": 1, "Contents": [{"Key": f'{kwargs["Prefix"]}events.gz'}]}
                return {"KeyCount": 0}

        paths = existing_raw_paths(
            PartitionS3(),
            "raw-bucket",
            [
                "raw/schema_version=1/dt=2026-09-12/hour=06",
                "raw/schema_version=1/dt=2026-09-12/hour=07",
            ],
        )
        self.assertEqual(paths, ["s3://raw-bucket/raw/schema_version=1/dt=2026-09-12/hour=07/*"])

    def test_attribution_labels_clicked_and_unclicked_impressions(self):
        events = [
            event("00000000-0000-4000-8000-000000000011", "product_impression", "2026-09-10T16:59:00.000Z"),
            event("00000000-0000-4000-8000-000000000012", "product_clicked", "2026-09-10T16:59:12.000Z"),
            event("00000000-0000-4000-8000-000000000013", "product_impression", "2026-09-10T16:00:00.000Z", "00000000-0000-4000-8000-000000000302"),
        ]
        rows = build_training_rows(events, "2026-09-10", "2026-09-11")
        self.assertEqual([row["labelClicked"] for row in rows], [1, 0])
        self.assertEqual(tuple(rows[0]), TRAINING_COLUMNS)

    def test_versioned_paths_and_header_bearing_utf8_csv(self):
        processed, exported = output_keys("2026-09-10", "2026-09-11")
        self.assertEqual(processed, "processed/interactions/source_date=2026-09-10/run_date=2026-09-11/")
        self.assertEqual(exported, "exports/training/run_date=2026-09-11/training.csv")
        csv_bytes = serialize_training_csv([])
        self.assertTrue(csv_bytes.startswith(b"impressionId,occurredAt"))
        csv_bytes.decode("utf-8")

    def test_cross_local_day_click_is_attributed_and_partition_is_loaded(self):
        events = [
            event("impression-cross-day", "product_impression", "2026-09-10T16:59:00Z"),
            event("click-cross-day", "product_clicked", "2026-09-10T17:05:00Z"),
        ]
        rows = build_training_rows(events, "2026-09-10", "2026-09-11")
        self.assertEqual(rows[0]["labelClicked"], 1)
        self.assertIn(("2026-09-10", "17"), overlapping_raw_partitions("2026-09-10"))

    def test_glue_argument_parser_uses_uppercase_aws_arguments(self):
        args = parse_job_args([
            "--SOURCE_DATE", "2026-09-10",
            "--RUN_DATE", "2026-09-11",
            "--RAW_BUCKET", "raw",
            "--PROCESSED_BUCKET", "processed",
        ])
        self.assertEqual(args.source_date, "2026-09-10")
        self.assertEqual(args.run_date, "2026-09-11")
        self.assertEqual(args.raw_bucket, "raw")

    def test_optional_training_fields_can_be_null_with_stable_schema(self):
        row = build_training_rows(
            [event("impression-null-optionals", "product_impression", "2026-09-10T16:59:00.000Z")],
            "2026-09-10",
            "2026-09-11",
        )[0]
        self.assertEqual(tuple(row), TRAINING_COLUMNS)
        self.assertIsNone(row["buyerPseudonym"])
        self.assertIsNone(row["recommendationId"])
        self.assertIsNone(row["projectionVersion"])
        self.assertEqual(training_schema_spec()[8], ("position", "int"))
        self.assertEqual(training_schema_spec()[15], ("labelClicked", "int"))

    def test_snapshot_as_of_join_and_normalized_features(self):
        before = {
            "snapshotAt": "2026-09-09T00:00:00Z",
            "runId": "run-before",
            "productId": PRODUCT,
            "snapshotSchemaVersion": 1,
            "productProjectionVersion": 2,
            "featureSchemaVersion": 1,
            "categoryId": "cat-1",
            "shopId": SHOP,
            "effectivePriceMinor": 1200,
            "ratingAverageBasisPoints": 400,
            "ratingCount": 500,
            "soldCount": 10,
            "promotionActive": True,
            "inventoryAvailable": 2,
            "productCreatedAt": "2026-08-01T00:00:00Z",
            "searchableText": "giay xanh",
        }
        future = {**before, "snapshotAt": "2026-09-11T00:00:00Z", "runId": "run-future", "effectivePriceMinor": 999}
        profile = {
            "snapshotAt": "2026-09-09T00:00:00Z",
            "profileGeneratedAt": "2026-09-09T00:00:00Z",
            "runId": "profile-before",
            "snapshotSchemaVersion": 1,
            "featureSchemaVersion": 1,
            "pseudonymKeyId": "key-1",
            "buyerPseudonym": "buyer-hash",
            "eligibilityScore": 50,
            "eligible": True,
            "viewCount30d": 50,
            "favoriteCount90d": 25,
            "followedShopCount": 10,
            "orderCount90d": 5,
            "categoryAffinities": [{"id": "cat-1", "weight": 80}],
            "shopAffinities": [{"id": SHOP, "weight": 40}],
            "preferredPriceMinMinor": 1000,
            "preferredPriceMaxMinor": 1500,
            "preferredPriceMeanMinor": 1200,
        }
        impression = {
            "impressionId": "impression-1",
            "occurredAt": "2026-09-10T00:01:00Z",
            "buyerPseudonym": "buyer-hash",
            "pseudonymKeyId": "key-1",
            "productId": PRODUCT,
            "labelClicked": 1,
            "sourceDate": "2026-09-09",
            "runDate": "2026-09-10",
            "_pseudonymKeyId": "key-1",
            "_query": "giay",
        }
        self.assertIs(as_of_snapshot([before, future], "productId", PRODUCT, parse_utc("2026-09-10T00:01:00Z")), before)
        enriched = enrich_training_rows([impression, {**impression, "impressionId": "impression-2", "labelClicked": 0}], [before, future], [profile], "key-1")
        self.assertEqual(len(enriched), 2)
        self.assertEqual(enriched[0]["category_affinity"], 0.8)
        self.assertEqual(enriched[0]["view_count_30d"], 0.1)
        self.assertEqual(enriched[0]["favorite_flag"], 0.05)
        self.assertEqual(enriched[0]["rating_average_basis_points"], 0.8)
        self.assertEqual(enriched[0]["rating_confidence"], 0.5)
        self.assertEqual(enriched[0]["promotion_active"], 1.0)
        self.assertEqual(set(ENRICHED_TRAINING_COLUMNS), set(enriched[0]))
        self.assertTrue(serialize_enriched_training_csv(enriched).startswith(b"example_id,dataset_version"))
        self.assertEqual(enrich_training_rows([impression], [before], [{**profile, "eligible": False}], "key-1"), [])

    def test_click_candidates_are_keyed_by_product_identity_and_context(self):
        impression = event("impression-indexed", "product_impression", "2026-09-10T16:59:00Z")
        matching = event("click-matching", "product_clicked", "2026-09-10T16:59:01Z")
        unrelated_product = {**matching, "eventId": "click-other-product", "productId": "other"}
        unrelated_user = {**matching, "eventId": "click-other-user", "sessionPseudonym": "other-user"}
        unrelated_request = {**matching, "eventId": "click-other-request", "requestId": "other-request"}
        index = _click_candidate_index([matching, unrelated_product, unrelated_user, unrelated_request])
        candidates = _click_candidates(impression, index)
        self.assertEqual([candidate["eventId"] for candidate in candidates], ["click-matching"])

    def test_buyer_state_carries_inactive_rows_and_prunes_old_profiles(self):
        previous = [{
            "buyerPseudonym": "inactive",
            "profileGeneratedAt": "2026-08-20T00:00:00Z",
            "snapshotAt": "2026-09-09T17:00:00Z",
        }, {
            "buyerPseudonym": "stale",
            "profileGeneratedAt": "2026-08-01T00:00:00Z",
        }]
        delta = [{
            "buyerPseudonym": "changed",
            "profileGeneratedAt": "2026-09-10T00:00:00Z",
        }]
        merged = merge_buyer_state(previous, delta, "2026-09-10", parse_utc("2026-09-10T17:00:00Z"))
        self.assertEqual([row["buyerPseudonym"] for row in merged], ["changed", "inactive"])
        self.assertTrue(all(row["sourceDate"] == "2026-09-10" for row in merged))

    def test_training_output_is_create_once_and_manifest_is_capped_at_thirty(self):
        uri = "s3://processed/exports/training/run_date=2026-09-12/training.csv"
        s3 = FakeS3()
        write_training_csv(s3, "processed", "exports/training/run_date=2026-09-12/training.csv", [])
        write_training_csv(s3, "processed", "exports/training/run_date=2026-09-12/training.csv", [])
        self.assertEqual(len(s3.puts), 1)
        old_uris = [f"s3://processed/exports/training/run_date=2026-08-{str(index + 1).zfill(2)}/training.csv" for index in range(30)]
        import json
        s3.objects["exports/training/latest.json"] = json.dumps({"uris": old_uris}).encode()
        uris = update_training_manifest(s3, "processed", uri)
        self.assertEqual(len(uris), 30)
        self.assertEqual(uris[0], uri)

    def test_create_once_supports_glue_legacy_botocore_without_if_none_match(self):
        s3 = LegacyGlueS3()
        _create_once_put(s3, "processed", "state/manifest.json", b"same")
        _create_once_put(s3, "processed", "state/manifest.json", b"same")
        self.assertEqual(s3.objects["state/manifest.json"], b"same")
        self.assertEqual(len(s3.puts), 1)
        with self.assertRaisesRegex(RuntimeError, "content conflict"):
            _create_once_put(s3, "processed", "state/manifest.json", b"different")

    def test_empty_committed_buyer_manifest_stays_enriched_instead_of_zero_filled_legacy(self):
        self.assertTrue(should_use_snapshot_enrichment(
            [{"dataset": "products", "parts": [{"key": "products/part.json.gz"}]}],
            [{"dataset": "buyer-profiles", "parts": []}],
        ))

    def test_snapshot_join_drops_anonymous_or_key_mismatched_rows(self):
        row = {"impressionId": "e", "occurredAt": "2026-09-10T00:01:00Z", "buyerPseudonym": "", "productId": PRODUCT, "labelClicked": 0}
        self.assertEqual(enrich_training_rows([row], [], [], "key-1"), [])


if __name__ == "__main__":
    unittest.main()
