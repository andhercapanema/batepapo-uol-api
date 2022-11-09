import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

const app = express();

app.use(cors());
app.use(express.json());
dotenv.config();
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

(async function connectToMongoClient() {
    try {
        await mongoClient.connect();
        db = mongoClient.db("batePapoUol");
        users = db.collection("users");
        mesages = db.collection("messages");
    } catch (err) {
        console.error(err);
    }
})();

app.listen(5000);
