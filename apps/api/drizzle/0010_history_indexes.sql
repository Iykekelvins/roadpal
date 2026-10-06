CREATE INDEX "jobs_request_id_index" ON "jobs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "jobs_provider_history" ON "jobs" USING btree ("provider_id","accepted_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_driver_id_index" ON "requests" USING btree ("driver_id");