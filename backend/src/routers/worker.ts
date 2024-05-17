import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from 'jsonwebtoken';
import { workerMiddleware } from "../middleware";
import { TOTAL_DECIMALS, WORKER_JWT_SECRET } from "../config";
import { getNextTask } from "../db";
import { createSubmissionInput } from "../types";

const TOTAL_SUBMISSIONS = 100;

const router = Router();

const prismaClient = new PrismaClient();

router.post("/payout", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId;
    const worker = await prismaClient.worker.findFirst({
        where: {
            id: Number(userId)
        }
    })

    if (!worker) {
        return res.status(403).json({
            message: "User not found."
        })
    }

    const address = worker.address;

    const txnId = "0x12345";

    await prismaClient.$transaction(async txn => {
        await txn.worker.update({
            where: {
                id: Number(userId)
            },
            data: {
                pending_amount: {
                    decrement: worker.pending_amount
                },
                locked_amount: {
                    increment: worker.pending_amount
                }
            }
        })

        await txn.payouts.create({
            data: {
                user_id: Number(userId),
                amount: worker.pending_amount,
                status: "Processing",
                signature: txnId
            }
        })

    })

    res.json({
        message: "Processing Payout.",
        amount: worker.pending_amount
    })

})

router.get("/balance", workerMiddleware, async(req, res) => {
    // @ts-ignore
    const userId: string = req.userId;
    const worker = await prismaClient.worker.findFirst({
        where:{
            id: Number(userId)
        }
    })

    res.json({
        pendingAmount: worker?.pending_amount,
        lockedAmount: worker?.locked_amount
    });
})

router.post("/submission", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const body = req.body;
    const parsedBody = createSubmissionInput.safeParse(body);

    if (parsedBody.success) {
        const task = await getNextTask(Number(userId));
        if(!task || task?.id !== Number(parsedBody.data.taskId)) {
            return res.status(411).json({
                message: "Incorrect Task Id."
            })
        }

        const amount = (Number(task.amount) / TOTAL_SUBMISSIONS);

        const submission = await prismaClient.$transaction(async txn => {
            const submission = await txn.submission.create({
                data: {
                    option_id: Number(parsedBody.data.selection),
                    worker_id: userId,
                    task_id: Number(parsedBody.data.taskId),
                    amount: Number(amount)
                }
            })

            await txn.worker.update({
                where: {
                    id: userId,
                },
                data: {
                    pending_amount: {
                        increment: Number(amount)
                    }
                }
            })

            return submission
        })

        const nextTask = await getNextTask(Number(userId));
        res.json({
            nextTask,
            amount
        })
    }
})

router.get("/nextTask", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId;

    const task = await getNextTask(Number(userId));

    if (!task) {
        res.status(411).json ({
            message: "No more tasks left to review."
        })
    } else {
        res.status(411).json({
            task
        })
    }
})

router.post("/signin", async (req, res) => {
    const hardcodedWalletAddress = '3zNrgQUXUW1ytsLExYTdSomdJTSRwNKFe8f24hzGvLa5';

    const existingUser = await prismaClient.worker.findFirst({
        where: {
            address: hardcodedWalletAddress
        }
    })

    if (existingUser) {
        const token = jwt.sign({
            userId: existingUser.id
        }, WORKER_JWT_SECRET)

        res.json({
            token
        })

    } else {
        const user = await prismaClient.worker.create({
            data: {
                address: hardcodedWalletAddress,
                pending_amount: 0,
                locked_amount: 0
            }
        })
        const token = jwt.sign({
            userId: user.id
        }, WORKER_JWT_SECRET)

        res.json({
            token
        })
    }
});

export default router;