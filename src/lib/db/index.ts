// Server-side by convention: imported only from "use server" actions and the seed CLI,
// never from client code. (No `server-only` guard — it would throw in the tsx seed script.)
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Neon HTTP driver: serverless-friendly, single-round-trip queries. Multi-statement
// atomicity (cascades) uses db.batch([...]) — the HTTP driver has no interactive tx.
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
