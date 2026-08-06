// Preflight for `npm run db:push`. `./env` MUST be imported first so DATABASE_URL is loaded
// before ./index reads it (drizzle-kit and tsx don't get Next's automatic env loading).
import "./env";
import { ensureExtensions } from "./extensions";

ensureExtensions().then(
  () => {
    console.log("extensions ok (vector)");
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
