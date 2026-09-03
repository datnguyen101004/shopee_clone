ALTER TABLE "shops"
ADD COLUMN "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

ALTER TABLE "shops"
ADD CONSTRAINT "shops_time_zone_check"
CHECK (char_length("time_zone") BETWEEN 1 AND 64);
