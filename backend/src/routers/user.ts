import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from 'jsonwebtoken';
import { JWT_SECRET, TOTAL_DECIMALS } from "../config";
import { authMiddleware } from "../middleware";
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { createTaskInput } from "../types";

const DEFAULT_TITLE = "Select the thumbnail you like the most."

const s3Client = new S3Client({
    credentials: {
        accessKeyId: "AKIA2IJS5YSC2YEGHDFN",
        secretAccessKey: "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",
    },
    region: "ap-south-1",
})

const router = Router();

const prismaClient = new PrismaClient();

router.get("/task", authMiddleware, async (req, res) => {
    // @ts-ignore
    const taskId: string = req.query.taskId;

    // @ts-ignore
    const userId: string = req.userId;

    const taskDetails = await prismaClient.task.findFirst({
        where: {
            user_id: Number(userId),
            id: Number(taskId)
        },
        include: {
            options: true
        }
    })

    if (!taskDetails) {
        return res.status(411).json({
            message: "You don't have access to this task."
        })
    }

    const responses = await prismaClient.submission.findMany({
        where: {
            task_id: Number(taskId)
        },
        include: {
            option: true
        }
    });

    const result: Record<string, {
        count: number,
        option: {
            imageURL: string
        }
    }> = {};

    taskDetails.options.forEach(option => {
        result[option.id] = {
            count: 0,
            option: {
                imageURL: option.image_url
            }
        }
    })

    responses.forEach(r => {
        result[r.option_id].count++
    });

    res.json({
        result
    })
})

router.post("/task", authMiddleware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const body = req.body;
    const parseData = createTaskInput.safeParse(body);

    if (!parseData.success) {
        return res.status(411).json({
            message: "You've sent wrong inputs."
        })
    }

    let response = await prismaClient.$transaction(async txn => {
        const response = await txn.task.create({
            data: {
                title: parseData.data.title ?? DEFAULT_TITLE,
                amount: 1 * TOTAL_DECIMALS,
                signature: parseData.data.signature,
                user_id: userId
            }
        });

        await txn.option.createMany({
            data: parseData.data.options.map(x => ({
                image_url: x.imageURL,
                task_id: response.id
            }))
        })

        return response;
    })

    res.json({
        id: response.id
    })
})

router.get("/presignedUrl", authMiddleware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId;

    const { url, fields } = await createPresignedPost(s3Client, {
        Bucket: 'd-dlp',
        Key: `dlp/${userId}/${Math.random()}/image.jpg`,
        Conditions: [
            ['content-length-range', 0, 5 * 1024 * 1024] // 5 MB max
        ],
        Expires: 3600
    })

    res.json({
        preSignedUrl: url,
        fields
    })

})

router.post("/signin", async (req, res) => {
    const hardcodedWalletAddress = 'DWkV7WirmqTp9sEK1xUYg7UnQKcCH4Wkrh2z53JCTPY2';

    const existingUser = await prismaClient.user.findFirst({
        where: {
            address: hardcodedWalletAddress
        }
    })

    if (existingUser) {
        const token = jwt.sign({
            userId: existingUser.id
        }, JWT_SECRET)

        res.json({
            token
        })

    } else {
        const user = await prismaClient.user.create({
            data: {
                address: hardcodedWalletAddress
            }
        })
        const token = jwt.sign({
            userId: user.id
        }, JWT_SECRET)

        res.json({
            token
        })
    }

});

export default router;