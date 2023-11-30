import 'dotenv/config';
import express from "express";
import axios from 'axios'
import * as cheerio from 'cheerio';
import cors from "cors";
import moment from 'moment-timezone';
import randomString from 'randomstring';

moment.tz.setDefault('Asia/Jakarta').locale('id');

const app = express();
// Whitelist domain yang diperbolehkan mengakses server Anda
const whitelist = ["https://jkt48live.github.io", "http://jkt48wrap-ui.test"];
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

const dl = express.Router();

const JeketiHeaders = {
    'Host': 'jkt48.com',
    'cache-control': 'max-age=0',
    'sec-ch-ua': '"Microsoft Edge";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-user': '?1',
    'sec-fetch-dest': 'document',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'dnt': '1',
    'sec-gpc': '1'
}

/* WEB JEKETI */
async function login(email, pass){
    try{
        const formData = `return_path=&login_id=${encodeURIComponent(email)}&login_password=${pass}`;
        const CookieString = randomString.generate(26);
        const Cookie = 'sid=' + CookieString;

        const login = await axios.post('https://jkt48.com/login?lang=id', formData, {
            headers: {
                Cookie
            }
        })

        if (login.data.includes('Alamat email atau Kata sandi salah')) {
            return "WRONG";
        } else {
            if(login.data.includes("Waktu kadaluwarsa akun Official Fanclub JKT48 Anda sudah lewat")){
                return "OFC_EXPIRED"
            }
            return CookieString;
        }
    } catch (error) {
        //console.error('Error:', error);
        if(error.response.data.includes('Server busy')){
            return "BUSY";
        }
        return false;
    }
}

//SPEND
const getTotalPages = async (cookie) => {
    try {
        const JeketiHeaders = { 'Cookie': `sid=${cookie};` };
        const { data } = await axios.get('https://jkt48.com/mypage/point-history', {
            params: { 'page': '1', 'lang': 'id' },
            headers: JeketiHeaders
        });
        const totalPages = cheerio.load(data)('.page').text().split('/').pop().trim();
        return parseInt(totalPages, 10);
    } catch (error) {
        console.error('Error fetching getTotalPages total pages:', error);
        return 0;
    }
};

async function scrapeTableData(page, cookie) {
    try {
        JeketiHeaders['Cookie'] = `sid=${cookie};`
        const response = await axios.get(`https://jkt48.com/mypage/point-history`, {
            params: { 'page': page, 'lang': 'id' },
            headers: JeketiHeaders
        });
        const $ = cheerio.load(response.data);
        const tableRows = $('.table tbody tr');
        let tableData = [];

        tableRows.each((i, elem) => {
            const row = $(elem).find('td').map((j, td) => $(td).text().trim()).get();
            tableData.push(row);
        });

        return tableData;
    } catch (error) {
        console.error(`Error fetching data scrapeTableData from page ${page}:`, error);
        return [];
    }
}

async function getAllTableData(cookie) {
    try {
        const totalPages = await getTotalPages(cookie);
        let allData = [];

        for (let page = 1; page <= totalPages; page++) {
            const pageData = await scrapeTableData(page, cookie);
            allData = allData.concat(pageData);
        }

        return allData;
    } catch (error) {
        console.error("Error getAllTableData:", error);
        return false;
    }
}

function extractAndSumValuesByYear(data) {
    let yearSummary = {};

    data.forEach(row => {
        const date = row[2]; // Tanggal Perubahan
        const year = date.split(' ')[2]; // Asumsi format tanggal adalah 'dd MM yyyy'
        const usage = row[3]; // Tujuan Pemakaian
        const changeColumn = row[5];
        const bonusMatch = changeColumn.match(/Bonus: ([0-9-+,]+)/);
        const pointMatch = changeColumn.match(/Buy: ([0-9-+,]+)/);

        let bonus = bonusMatch ? parseInt(bonusMatch[1].replace(/[+,]/g, ''), 10) : 0;
        let point = pointMatch ? parseInt(pointMatch[1].replace(/[+,]/g, ''), 10) : 0;

        if (!yearSummary[year]) {
            yearSummary[year] = { summary: {}, totalBonus: 0, totalPoints: 0 };
        }

        if (!yearSummary[year].summary[usage]) {
            yearSummary[year].summary[usage] = { totalBonus: 0, totalPoints: 0 };
        }

        yearSummary[year].summary[usage].totalBonus += bonus;
        yearSummary[year].summary[usage].totalPoints += point;
        yearSummary[year].totalBonus += bonus;
        yearSummary[year].totalPoints += point;
    });

    return yearSummary;
}
//END SPEND

async function myPage(cookie) {
    try {
        JeketiHeaders['Cookie'] = `sid=${cookie};`
        const { data } = await axios.get(`https://jkt48.com/mypage`, {
            headers: JeketiHeaders
        });
        const $ = cheerio.load(data);

        //Oshi
        const oshiText = $('.entry-mypage__item--subject:contains("Anggota yang paling disukai")')
            .next('.entry-mypage__item--content').text().trim();
        const oshi = (oshiText == "Silahkan pilih anggota yang paling disukai") ? "<s>Tidak ada</s> / 1 Jeketi" : oshiText;

        // Foto Oshi
        const oshiPic = "https://jkt48.com"+$('.entry-mypage__profile img').attr('src') || 'No Image Found';

        // Mencari jumlah kedatangan teater
        const teaterKedatanganText = $('.entry-mypage__item--subject:contains("Jumlah kedatangan teater")')
            .next('.entry-mypage__item--content').text().trim();

        const teaterKedatangan = teaterKedatanganText.match(/[\d,]+/)[0]

        // Mencari jumlah JKT48 Points
        const jkt48PointsText = $('.entry-mypage__item--subject:contains("Jumlah JKT48 Points")')
            .next('.entry-mypage__item--content').text();

        // Menggunakan regex untuk mengekstrak angka saja
        const jkt48Points = jkt48PointsText.match(/[\d,]+/)[0].replace(/,/g, '');

        // Mencari Bonus Points
        const bonusPointsText = $('.entry-mypage__item--subject:contains("Bonus Points")')
            .next('.entry-mypage__item--content').text();

        const bonusPoints = bonusPointsText.match(/[\d,]+/)[0].replace(/,/g, '');

        return {
            oshi,
            teaterKedatangan,
            jkt48Points,
            bonusPoints,
            oshiPic
        };
    } catch (error) {
        console.error("Error myPage:", error);
        return false;
    }
}

async function scrapeProfile(cookie) {
    try {
        JeketiHeaders['Cookie'] = `sid=${cookie};`
        const response = await axios.get(`https://jkt48.com/change/form?lang=id`, {
            headers: JeketiHeaders
        });
        const $ = cheerio.load(response.data);
        
        const nickname = $('#nickname').val();
        return nickname;
    } catch (error) {
        console.error(`Error fetching data from page ${page}:`, error);
        return [];
    }
}

//Theater
const getTheaterTotalPages = async (cookie) => {
    try {
        const JeketiHeaders = { 'Cookie': `sid=${cookie};` };
        const { data } = await axios.get('https://jkt48.com/mypage/ticket-list', {
            params: { 'page': '1', 'lang': 'id' },
            headers: JeketiHeaders
        });
        const totalPages = cheerio.load(data)('.page').text().split('/').pop().trim();
        return parseInt(totalPages, 10);
    } catch (error) {
        console.error('Error fetching getTheaterTotalPages total pages:', error);
        return 0;
    }
};

async function scrapeTheaterTableData(page, cookie) {
    try {
        JeketiHeaders['Cookie'] = `sid=${cookie};`
        const response = await axios.get(`https://jkt48.com/mypage/ticket-list`, {
            params: { 'page': page, 'lang': 'id' },
            headers: JeketiHeaders
        });
        const $ = cheerio.load(response.data);
        const tableRows = $('.table tbody tr');
        let tableData = [];

        tableRows.each((i, elem) => {
            const row = $(elem).find('td').map((j, td) => $(td).text().trim()).get();
            tableData.push(row);
        });

        return tableData;
    } catch (error) {
        console.error(`Error fetching data scrapeTheaterTableData from page ${page}:`, error);
        return [];
    }
}

async function getAllYears(cookie) {
    try {
        const totalPages = await getTheaterTotalPages(cookie);
        const uniqueYears = new Set();

        for (let page = 1; page <= totalPages; page++) {
            const tableData = await scrapeTheaterTableData(page, cookie);
            tableData.forEach(row => {
                const year = parseInt(row[1].split(' ')[2]); // Extract year and convert to integer
                if (year >= 2022) { // Check if year is 2022 or later
                    uniqueYears.add(year);
                }
            });
        }

        return Array.from(uniqueYears);
    } catch (error) {
        console.error("Error getAllYears:", error);
        return false;
    }
}

async function fetchTopSetlists(cookie, year = null) {
    try {
        const totalPages = await getTheaterTotalPages(cookie);
        let setlistCounts = {};

        for (let page = 1; page <= totalPages; page++) {
            const tableData = await scrapeTheaterTableData(page, cookie);

            tableData.forEach(row => {
                const entryYear = row[1].split(' ')[2];
                if (year && entryYear !== year.toString()) {
                    return;
                }

                const setlistName = row[2];
                const winStatus = row[0].startsWith('Detil') ? 1 : 0;

                if (!setlistCounts[setlistName]) {
                    setlistCounts[setlistName] = { appearances: 0, wins: 0 };
                }
                setlistCounts[setlistName].appearances++;
                setlistCounts[setlistName].wins += winStatus;
            });
        }

        return Object.entries(setlistCounts)
            .filter(([name, count]) => count.wins > 0)
            .sort((a, b) => b[1].wins - a[1].wins)
            .slice(0, 3)
            .map(setlist => ({ name: setlist[0], wins: setlist[1].wins }));
    } catch (error) {
        console.error("Error fetchTopSetlists:", error);
        return false;
    }
}

async function calculateWinLossRate(cookie, year = null) {
    try {
        let wins = 0;
        let losses = 0;
        const totalPages = await getTheaterTotalPages(cookie);

        for (let page = 1; page <= totalPages; page++) {
            const tableData = await scrapeTheaterTableData(page, cookie);

            tableData.forEach(row => {
                const entryYear = row[1].split(' ')[2]; // Assuming '15 November 2023' format
                if (year && entryYear !== year.toString()) {
                    return;
                }

                if (row[0].startsWith('Detil')) {
                    wins++;
                } else if (row[0] === 'Kalah') {
                    losses++;
                }
            });
        }

        const totalGames = wins + losses;
        const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

        return {
            year: year || 'All Time',
            wins,
            losses,
            winRate: winRate.toFixed(2) + '%'
        };
    } catch (error) {
        console.error("Error calculateWinLossRate:", error);
        return false;
    }
}
//END THEATER

//EVENT
const getEventTotalPages = async (cookie) => {
    try {
        const JeketiHeaders = { 'Cookie': `sid=${cookie};` };
        const { data } = await axios.get('https://jkt48.com/mypage/event-list', {
            params: { 'page': '1', 'lang': 'id' },
            headers: JeketiHeaders
        });
        const totalPages = cheerio.load(data)('.page').text().split('/').pop().trim();
        return parseInt(totalPages, 10);
    } catch (error) {
        console.error('Error fetching getEventTotalPages:', error);
        return 0;
    }
};

async function scrapeEventListData(page, cookie) {
    try {
        const JeketiHeaders = { 'Cookie': `sid=${cookie};` };
        const response = await axios.get(`https://jkt48.com/mypage/event-list`, {
            params: { 'page': page, 'lang': 'id' },
            headers: JeketiHeaders
        });
        const $ = cheerio.load(response.data);
        const tableRows = $('.table tbody tr');
        let tableData = [];

        tableRows.each((i, elem) => {
            const row = $(elem).find('td').map((j, td) => $(td).text().trim()).get();
            tableData.push(row);
        });

        return tableData;
    } catch (error) {
        console.error(`Error fetching data scrapeEventListData from page ${page}:`, error);
        return [];
    }
}

async function fetchTopThreeEventWins(cookie, year) {
    try {
        const totalPages = await getEventTotalPages(cookie);
        let recentWins = [];

        for (let page = 1; page <= totalPages; page++) {
            const tableData = await scrapeEventListData(page, cookie);

            tableData.forEach(row => {
                const winStatus = row[0].includes('Detil');
                const eventDate = row[1];
                const eventYear = row[1].split(' ')[2];

                if (winStatus && eventYear === year.toString()) {
                    const eventName = row[2];
                    recentWins.push({ name: eventName, date: eventDate });
                }
            });

            // Break early if we already have the last three wins
            if (recentWins.length >= 3) {
                break;
            }
        }

        // Sort by date and get the last three wins
        recentWins.sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastThreeWins = recentWins.slice(0, 3);

        return lastThreeWins;
    } catch (error) {
        console.error("Error in fetchTopThreeEventWins:", error);
        return false;
    }
}
//END EVENT

//VC
async function fetchTopVideoCallMembersByYear(cookie, year) {
    try {
        JeketiHeaders['Cookie'] = `sid=${cookie};`
        const { data } = await axios.get(`https://jkt48.com/mypage/handshake-session?lang=id`, {
            headers: JeketiHeaders
        });
        const $ = cheerio.load(data);

        let memberTicketData = {};
        let totalTickets = 0; // Total tickets counter

        $('h4').each((index, element) => {
            if ($(element).text().includes(year.toString())) {
                $(element).next('.entry-mypage__history').find('table.table tbody tr').each((i, row) => {
                    const memberName = $(row).find('td:nth-child(5)').text().trim();
                    const ticketsBought = parseInt($(row).find('td:nth-child(6)').text().trim(), 10) || 0;

                    totalTickets += ticketsBought; // Add to total tickets

                    if (!memberTicketData[memberName]) {
                        memberTicketData[memberName] = 0;
                    }
                    memberTicketData[memberName] += ticketsBought;
                });
            }
        });

        const sortedMembers = Object.entries(memberTicketData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(member => ({ name: member[0], tickets: member[1] }));

        return { topMembers: sortedMembers, totalTickets };
    } catch (error) {
        console.error('Error fetching data fetchTopVideoCallMembersByYear:', error);
        return [];
    }
}
/* END */

function formatYearData(byYear, year) {
    let result = `<b>=== ${year} ===</b>\n`;
    let totalTopup = 0;
    let totalBonus = 0;
    let totalSpend = 0;
    let totalBonusSpend = 0;

    if (byYear[year].summary['JKT48 Points']) {
        totalTopup = byYear[year].summary['JKT48 Points'].totalPoints;
        totalBonus = byYear[year].summary['JKT48 Points'].totalBonus;
        result += `Topup: ${numbFormat(totalTopup)} P\n`;
        if (byYear[year].summary['JKT48 Points'].totalBonus !== 0) {
            result += `Bonus: ${numbFormat(byYear[year].summary['JKT48 Points'].totalBonus)} P\n`;
        }
        result += "\n";
    }

    for (let usage in byYear[year].summary) {
        if (usage !== 'JKT48 Points') {
            let spend = byYear[year].summary[usage].totalPoints;
            let bonus = byYear[year].summary[usage].totalBonus;
            totalSpend += Math.abs(spend);
            totalBonusSpend += bonus;
            result += `${usage}: ${numbFormat(spend)} P\n`;
            if (byYear[year].summary[usage].totalBonus !== 0) {
                result += `${usage} Bonus: ${numbFormat(byYear[year].summary[usage].totalBonus)} P\n`;
            }
        }
    }

    let sisaPoin = totalTopup - totalSpend;
    result += `\nTotal Spend: -${numbFormat(totalSpend)} P\n`;
    result += `Bonus Spend: ${numbFormat(totalBonusSpend)} P\n`;
    //result += `Sisa Point: ${numbFormat(sisaPoin)} P\n`;
    result += "====================\n\n";

    return { result, totalTopup, totalBonus, totalSpend, totalBonusSpend };
}

function numbFormat(number){
    return new Intl.NumberFormat(['id']).format(number);
}

dl.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const do_login = await login(email, password);
        if(do_login == "BUSY") return res.status(401).json({ success: false, message: "jkt48.com server busy" });
        if(do_login == "WRONG") return res.status(401).json({ success: false, message: "Alamat email atau password salah" });
        if(do_login == "OFC_EXPIRED") return res.status(401).json({ success: false, message: "Gagal mengambil data, OFC kamu Expired" });
        if(!do_login) return res.status(401).json({ success: false, message: "Gagal mengambil data jkt48.com, server error" });

        const years = await getAllYears(do_login);
        const yrs = [];

        years.map(year => {
            yrs.push({ year, cookie:do_login })
        });

        res.json({ success: true, data: yrs });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
    }
});

dl.post('/getData', async (req, res) => {
    try {
        const { cookie, year } = req.body;
        let data = {
            theater: {},
            events: {},
            videoCall: {},
            topUp: {}
        };
        
        const yearSelected = year;

        const [topSetlists, winLossData, topVideoCalls, profile, spendTable, myPej, lastEvent] = await Promise.all([
            fetchTopSetlists(cookie, yearSelected),
            calculateWinLossRate(cookie, yearSelected),
            fetchTopVideoCallMembersByYear(cookie, yearSelected),
            scrapeProfile(cookie),
            getAllTableData(cookie),
            myPage(cookie),
            fetchTopThreeEventWins(cookie, yearSelected)
        ]);

        data.name = profile;
        data.oshi = myPej.oshi;
        data.oshiPic = myPej.oshiPic;

        //Theater
        if (topSetlists.length !== 0) {
            // Menambahkan Top 3 Setlist
            data.theater.topSetlists = topSetlists.slice(0, 3).map((setlist, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                return `${medal} ${setlist.name} - ${setlist.wins}x`;
            });
        
            // Menambahkan Winrate data
            data.theater.winrate = {
                rate: winLossData.winRate,
                detail: {
                    menang: winLossData.wins,
                    kalah: winLossData.losses
                }
            };
        } else {
            data.theater = "Belum pernah Theateran 😭";
        }

        // Event
        if (lastEvent.length !== 0) {
            data.events.lastEvents = lastEvent.slice(0, 3).map(event => event.name);
        } else {
            data.events = "Belum pernah ikut Event 😭";
        }

        // Video Call
        if (topVideoCalls.topMembers.length !== 0) {
            data.videoCall.topMembers = topVideoCalls.topMembers.slice(0, 3).map((member, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                return `${medal} ${member.name} - ${member.tickets} tiket`;
            });

            data.videoCall.totalTickets = topVideoCalls.totalTickets;
        } else {
            data.videoCall = "Belum pernah Video Call 😭";
        }

        // Top-up
        const byYear = extractAndSumValuesByYear(spendTable);
        if (byYear[yearSelected]) {
            const spendData = formatYearData(byYear, yearSelected);
            data.topUp = `${numbFormat(spendData.totalTopup)} P`;
        } else {
            data.topUp = "0 P";
        }
        
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
    }
});

export default dl;