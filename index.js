import express from "express";
import cors from "cors";
import bodyParser from 'body-parser';
import dl from "./dl.js";
const port = 3148;
 
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/wrap", dl);

app.listen(port, () => console.log(`Server Running at http://localhost:${port}`));