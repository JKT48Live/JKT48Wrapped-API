import express from "express";
import cors from "cors";
import bodyParser from 'body-parser';
import dl from "./dl.js";
const port = 3000;
 
const app = express();
const whitelist = ["https://jkt48live.github.io"];
// Konfigurasi CORS
const corsOptions = {
    origin: function (origin, callback) {
        // Periksa apakah origin ada dalam whitelist
        if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error("Akses Ditolak oleh CORS"));
        }
    },
};
  
// Gunakan middleware CORS dengan konfigurasi
app.use(cors(corsOptions));
app.use(bodyParser.json());

app.use("/wrap", dl);

app.listen(port, () => console.log(`Server Running at http://localhost:${port}`));