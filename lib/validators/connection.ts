import { z } from "zod";

import { CONTACT_REMARK_MAX_LEN } from "@/lib/connections/contact-remark";

export const patchContactRemarkSchema = z.object({
  remark: z.union([z.string().max(CONTACT_REMARK_MAX_LEN), z.null()]).transform((s) => {
    if (s == null) return null;
    const t = s.trim();
    return t === "" ? null : t;
  }),
});
