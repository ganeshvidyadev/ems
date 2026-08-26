import { z } from 'zod';

export const JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Durable job status — bulk import/export, reports. Backs `GET console/jobs/:id`. */
export const jobResponseSchema = z.object({
  /** `job_runs.id` — a plain numeric id as a string, not a ULID: this entity predates `publicId`. */
  id: z.string(),
  jobType: z.string(),
  status: z.enum(JOB_STATUSES),
  totalRows: z.number().nullable(),
  processedRows: z.number(),
  successRows: z.number(),
  failedRows: z.number(),
  progressPercent: z.number(),
  errorReportUrl: z.string().nullable(),
  outputUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type JobResponse = z.infer<typeof jobResponseSchema>;
