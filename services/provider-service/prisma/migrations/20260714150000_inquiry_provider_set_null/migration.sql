-- #650 (PDPA erasure): preserve customers' received-inquiry history when a
-- PROVIDER account is erased. The Inquiry→Provider FK was ON DELETE CASCADE, so
-- deleting a provider row cascade-deleted every inquiry that provider received
-- — destroying the CUSTOMER's name/phone/email/message and the whole
-- InquiryMessage thread (their own data, not the provider's). Switch the FK to
-- ON DELETE SET NULL and make "providerId" nullable so erasing the provider
-- detaches those inquiries instead of deleting them: the customer keeps their
-- history, the provider's identifying PII is gone with the Provider row.
-- InquiryMessage cascades from Inquiry (not from Provider), so the thread
-- survives the detach.
--
-- Guarded/idempotent and boot-safe on a populated DB: dropping the FK and
-- re-adding it with the new rule leaves every existing row untouched (SET NULL
-- only ever fires on a future provider delete); DROP NOT NULL is a no-op if the
-- column is already nullable.

ALTER TABLE "Inquiry" DROP CONSTRAINT IF EXISTS "Inquiry_providerId_fkey";

ALTER TABLE "Inquiry" ALTER COLUMN "providerId" DROP NOT NULL;

ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "Provider"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
