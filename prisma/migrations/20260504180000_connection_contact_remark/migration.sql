-- Private per-user display name for a DM (WeChat-style "remark"); does not change peer's profile.
ALTER TABLE "Connection" ADD COLUMN "contactRemarkByA" VARCHAR(64),
ADD COLUMN "contactRemarkByB" VARCHAR(64);
