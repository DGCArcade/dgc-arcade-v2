import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import { authRouter } from "./auth.js";
import { usersRouter } from "./users.js";
import { gamesRouter } from "./games.js";
import { betsRouter } from "./bets.js";
import { transactionsRouter } from "./transactions.js";
import { leaderboardRouter } from "./leaderboard.js";
import { statsRouter } from "./stats.js";
import { adminRouter } from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/games", gamesRouter);
router.use("/bets", betsRouter);
router.use("/transactions", transactionsRouter);
router.use("/leaderboard", leaderboardRouter);
router.use("/stats", statsRouter);
router.use("/admin", adminRouter);

export default router;
