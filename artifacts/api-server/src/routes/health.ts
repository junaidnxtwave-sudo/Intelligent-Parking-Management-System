import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getSupabaseClient } from "../lib/supabase";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/supabase/check", async (_req, res): Promise<void> => {
  const table = "parking_lots";
  const configured =
    Boolean(process.env.SUPABASE_URL?.trim()) &&
    Boolean(process.env.SUPABASE_PUBLISHABLE_KEY?.trim());

  try {
    const { error } = await getSupabaseClient()
      .from(table)
      .select("id")
      .limit(1);

    if (error) {
      const missingTable =
        error.code === "PGRST205" || error.code === "42P01";
      res.status(missingTable ? 424 : 502).json({
        status: missingTable ? "table_missing" : "unavailable",
        table,
        errorCode: error.code ?? "SUPABASE_QUERY_FAILED",
      });
      return;
    }

    res.json({ status: "connected", table });
  } catch {
    res.status(configured ? 502 : 503).json({
      status: configured ? "unavailable" : "not_configured",
      table,
      errorCode: configured ? "SUPABASE_REQUEST_FAILED" : "CONFIG_MISSING",
    });
  }
});

export default router;
