import { ValidationError } from "@/lib/errors";
import type { FileInput } from "@/server/messaging";

/** Files from a multipart form (field name `files`), limited in count; content is validated by the services. */
export async function filesFrom(form: FormData, field = "files", max = 5): Promise<FileInput[]> {
  const raw = form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  if (raw.length > max) throw new ValidationError(`At most ${max} attachments`);
  return Promise.all(raw.map(async (f) => ({ buffer: Buffer.from(await f.arrayBuffer()), filename: f.name })));
}
